import { getAdminDb } from '@/lib/firebase/admin';
import { extractReceiptData } from './gemini';
import { generateQrCodeDataUrl } from '@/lib/qr/generator';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { signTicket } from '@/lib/qr/hmac';

const AMOUNT_TOLERANCE = 5; // EGP

/**
 * Process a single queued registrant document through the OCR pipeline.
 *
 * 1. Download image
 * 2. Send to Gemini Vision
 * 3. Save extraction results
 * 4. Reconcile against bankTransactions
 * 5. Update registrant status & create ticket if matched
 */
export async function processRegistrantOcr(registrantId: string): Promise<{
  success: boolean;
  status: string;
  error?: string;
}> {
  const db = getAdminDb();
  const regRef = db.collection('registrants').doc(registrantId);

  try {
    // 1. Mark as processing to prevent concurrent runs
    await regRef.update({
      ocrStatus: 'processing',
    });

    const regSnap = await regRef.get();
    if (!regSnap.exists) {
      return { success: false, status: 'failed', error: 'Document not found' };
    }

    const regData = regSnap.data()!;
    const screenshotUrl = regData.paymentScreenshotUrl;

    if (!screenshotUrl) {
      await regRef.update({
        ocrStatus: 'failed',
        ocrConfidence: 'failed',
        status: 'manual_review',
        adminNotes: 'لم يتم العثور على صورة إيصال الدفع',
      });
      return { success: false, status: 'failed', error: 'No screenshot URL' };
    }

    // 2. Download image
    const response = await fetch(screenshotUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image (HTTP ${response.status})`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Extract data via Gemini
    const ocrResult = await extractReceiptData(buffer, contentType);

    const updateData: Record<string, unknown> = {
      ocrStatus: 'done',
      ocrExtractedReference: ocrResult.reference_number || null,
      ocrExtractedAmount: ocrResult.amount || null,
      ocrExtractedSenderName: ocrResult.sender_name || null,
      ocrConfidence: ocrResult.confidence,
    };

    let status = 'manual_review';

    if (ocrResult.confidence === 'failed') {
      updateData.status = 'manual_review';
      updateData.adminNotes = `فشل التعرف على الإيصال: ${ocrResult.notes}`;
    } else if (ocrResult.confidence === 'high' && ocrResult.reference_number) {
      // 4. Try reconciliation against bankTransactions
      const matched = await attemptReconciliation(
        registrantId,
        ocrResult.reference_number,
        ocrResult.amount,
        db
      );

      if (matched.success) {
        status = 'auto_approved';
        updateData.status = 'auto_approved';
        updateData.verifiedAt = FieldValue.serverTimestamp();
      } else {
        updateData.status = 'manual_review';
        updateData.adminNotes = matched.reason || 'بانتظار مطابقة كشف الحساب البنكي';
      }
    } else {
      updateData.status = 'manual_review';
      updateData.adminNotes = ocrResult.notes || 'جودة الصورة منخفضة، تتطلب مراجعة يدوية';
    }

    await regRef.update(updateData);
    return { success: true, status };
  } catch (error) {
    console.error(`OCR processing failed for ${registrantId}:`, error);

    const errorMsg = error instanceof Error ? error.message : String(error);
    await regRef.update({
      ocrStatus: 'failed',
      status: 'manual_review',
      adminNotes: `خطأ في المعالجة التلقائية: ${errorMsg}`,
    });

    return { success: false, status: 'failed', error: errorMsg };
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
    return { success: false, reason: 'لم يتم العثور على المعاملة في كشف الحساب بعد' };
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
