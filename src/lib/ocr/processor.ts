import { getAdminDb } from '@/lib/firebase/admin';
import { processOcrBatch, OcrRequestItem } from './visionApi';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { signTicket } from '@/lib/qr/hmac';
import { generateQrCodeDataUrl } from '@/lib/qr/generator';

const AMOUNT_TOLERANCE = 5; // EGP

export async function processRegistrantOcrBatch(registrants: Array<{ id: string; url: string }>): Promise<Array<{
  id: string;
  success: boolean;
  status: string;
  error?: string;
}>> {
  if (registrants.length === 0) return [];

  const db = getAdminDb();
  const results = [];

  try {
    // 1. Mark all as processing
    const batch = db.batch();
    for (const reg of registrants) {
      batch.update(db.collection('registrants').doc(reg.id), {
        ocrStatus: 'processing',
      });
    }
    await batch.commit();

    // 2. Call custom OCR API
    const ocrResponse = await processOcrBatch(registrants);

    // 3. Process each result
    for (const result of ocrResponse.results) {
      const regRef = db.collection('registrants').doc(result.id);
      
      try {
        const updateData: Record<string, unknown> = {
          ocrStatus: 'done',
          ocrExtractedReference: result.reference_number || null,
          ocrExtractedAmount: result.amount || null,
          ocrExtractedSenderName: result.sender_name || null,
          ocrConfidence: result.confidence,
        };

        let status = 'manual_review';

        if (result.confidence === 'failed') {
          updateData.status = 'manual_review';
          updateData.adminNotes = `فشل التعرف على الإيصال: ${result.notes}`;
        } else if (result.confidence === 'high' && result.reference_number) {
          // 4. Try reconciliation against bankTransactions
          const matched = await attemptReconciliation(
            result.id,
            result.reference_number,
            result.amount,
            db
          );

          if (matched.success) {
            status = 'auto_approved';
            updateData.status = 'auto_approved';
            updateData.verifiedAt = FieldValue.serverTimestamp();
            updateData.adminNotes = null;
          } else {
            updateData.status = 'manual_review';
            updateData.adminNotes = matched.reason || null;
          }
        } else {
          updateData.status = 'manual_review';
          updateData.adminNotes = result.notes || null;
        }

        await regRef.update(updateData);
        results.push({ id: result.id, success: true, status });
      } catch (err) {
        console.error(`Failed to process result for ${result.id}:`, err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        await regRef.update({
          ocrStatus: 'failed',
          status: 'manual_review',
          adminNotes: `خطأ في المعالجة التلقائية: ${errorMsg}`,
        });
        results.push({ id: result.id, success: false, status: 'failed', error: errorMsg });
      }
    }

    return results;
  } catch (error) {
    console.error(`Batch OCR processing failed:`, error);
    
    // Revert all to failed
    const errorMsg = error instanceof Error ? error.message : String(error);
    const failBatch = db.batch();
    for (const reg of registrants) {
      failBatch.update(db.collection('registrants').doc(reg.id), {
        ocrStatus: 'failed',
        status: 'manual_review',
        adminNotes: `فشل استدعاء API الخارجي: ${errorMsg}`,
      });
      results.push({ id: reg.id, success: false, status: 'failed', error: errorMsg });
    }
    await failBatch.commit();
    
    return results;
  }
}

/**
 * Reconcile a registrant against the bankTransactions collection.
 * Uses reference number as document ID lookup.
 */
async function attemptReconciliation(
  registrantId: string,
  referenceNumber: string,
  extractedAmount: number | null,
  db: Firestore
): Promise<{ success: boolean; reason?: string }> {
  const txRef = db.collection('bankTransactions').doc(referenceNumber.trim());
  const txSnap = await txRef.get();

  if (!txSnap.exists) {
    return { success: false };
  }

  const txData = txSnap.data()!;

  // Check for duplicate reference
  if (txData.matchedRegistrantId && txData.matchedRegistrantId !== registrantId) {
    // Flag both registrants
    await db.collection('registrants').doc(txData.matchedRegistrantId).update({
      adminNotes: `⚠️ تكرار في رقم المرجع — مستخدم أيضًا في ${registrantId}`,
    });
    return {
      success: false,
      reason: `⚠️ رقم المرجع مكرر — مستخدم بالفعل في طلب آخر (${txData.matchedRegistrantId})`,
    };
  }

  // Amount verification with tolerance
  if (extractedAmount != null) {
    const diff = Math.abs(extractedAmount - txData.amount);
    if (diff > AMOUNT_TOLERANCE) {
      return {
        success: false,
        reason: `اختلاف في المبلغ: المستخرج=${extractedAmount}، البنك=${txData.amount}`,
      };
    }
  }

  // Match! Atomically update bank transaction & create ticket in a batch
  const batch = db.batch();

  batch.update(txRef, {
    matchedRegistrantId: registrantId,
  });

  // Generate QR ticket
  const qrToken = signTicket(registrantId);
  const qrImageUrl = await generateQrCodeDataUrl(registrantId);

  const ticketRef = db.collection('tickets').doc(registrantId);
  batch.set(ticketRef, {
    qrToken,
    qrImageUrl,
    used: false,
    usedAt: null,
    usedByUsherId: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return { success: true };
}
