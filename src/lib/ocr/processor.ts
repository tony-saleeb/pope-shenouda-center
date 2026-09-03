import { getAdminDb } from '@/lib/firebase/admin';
import { processOcrBatch, OcrRequestItem } from './visionApi';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { stageAttendanceTicketOnBatch } from '@/lib/qr/issueAttendanceTicket';
import { trackRequiresAttendanceQr } from '@/lib/registrationTracks';

const AMOUNT_TOLERANCE = 5; // EGP

/** Statuses an admin sets by hand. OCR must never overwrite them. */
const HUMAN_DECIDED_STATUSES: ReadonlySet<string> = new Set(['approved', 'rejected']);

/** True when an admin has already ruled on this registrant. */
export function isAdminDecided(status: unknown): boolean {
  return typeof status === 'string' && HUMAN_DECIDED_STATUSES.has(status);
}

export async function processRegistrantOcrBatch(registrants: Array<{ id: string; url: string }>): Promise<Array<{
  id: string;
  success: boolean;
  status: string;
  error?: string;
}>> {
  if (registrants.length === 0) return [];

  const db = getAdminDb();
  const results: Array<{ id: string; success: boolean; status: string; error?: string }> = [];

  // Registrants an admin already ruled on leave the queue without being re-processed:
  // re-running OCR would replace the decision, the notes and the verification stamp.
  const decided = await findAdminDecided(db, registrants.map((reg) => reg.id));
  const pending = registrants.filter((reg) => !decided.has(reg.id));

  if (decided.size > 0) {
    const skipBatch = db.batch();
    for (const id of decided) {
      skipBatch.update(db.collection('registrants').doc(id), { ocrStatus: 'skipped' });
      results.push({ id, success: true, status: 'skipped' });
    }
    await skipBatch.commit();
  }

  if (pending.length === 0) {
    return results;
  }

  try {
    // 1. Mark all as processing
    const batch = db.batch();
    for (const reg of pending) {
      batch.update(db.collection('registrants').doc(reg.id), {
        ocrStatus: 'processing',
      });
    }
    await batch.commit();

    // 2. Call custom OCR API
    const ocrResponse = await processOcrBatch(pending);

    // 3. Process each result
    for (const result of ocrResponse.results) {
      try {
        const ocrFields: Record<string, unknown> = {
          ocrStatus: 'done',
          ocrExtractedReference: result.reference_number || null,
          ocrExtractedAmount: result.amount || null,
          ocrExtractedSenderName: result.sender_name || null,
          ocrConfidence: result.confidence,
        };

        const decisionFields: Record<string, unknown> = {};
        let status = 'manual_review';

        if (result.confidence === 'failed') {
          decisionFields.status = 'manual_review';
          decisionFields.adminNotes = `فشل التعرف على الإيصال: ${result.notes}`;
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
            decisionFields.status = 'auto_approved';
            decisionFields.verifiedAt = FieldValue.serverTimestamp();
            decisionFields.adminNotes = null;
          } else {
            decisionFields.status = 'manual_review';
            decisionFields.adminNotes = matched.reason || null;
          }
        } else {
          decisionFields.status = 'manual_review';
          decisionFields.adminNotes = result.notes || null;
        }

        const applied = await applyOcrResult(db, result.id, ocrFields, decisionFields);
        results.push({ id: result.id, success: true, status: applied ? status : 'skipped' });
      } catch (err) {
        console.error(`Failed to process result for ${result.id}:`, err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        await applyOcrResult(
          db,
          result.id,
          { ocrStatus: 'failed' },
          { status: 'manual_review', adminNotes: `خطأ في المعالجة التلقائية: ${errorMsg}` }
        );
        results.push({ id: result.id, success: false, status: 'failed', error: errorMsg });
      }
    }

    return results;
  } catch (error) {
    console.error(`Batch OCR processing failed:`, error);
    
    // Revert all to failed
    const errorMsg = error instanceof Error ? error.message : String(error);
    for (const reg of pending) {
      await applyOcrResult(
        db,
        reg.id,
        { ocrStatus: 'failed' },
        { status: 'manual_review', adminNotes: `فشل استدعاء API الخارجي: ${errorMsg}` }
      );
      results.push({ id: reg.id, success: false, status: 'failed', error: errorMsg });
    }

    return results;
  }
}

/** Return the subset of ids whose registrant already carries an admin decision. */
async function findAdminDecided(db: Firestore, ids: string[]): Promise<Set<string>> {
  const decided = new Set<string>();
  if (ids.length === 0) return decided;

  const snapshots = await db.getAll(...ids.map((id) => db.collection('registrants').doc(id)));
  for (const snapshot of snapshots) {
    const status = snapshot.data()?.status;
    if (typeof status === 'string' && HUMAN_DECIDED_STATUSES.has(status)) {
      decided.add(snapshot.id);
    }
  }
  return decided;
}

/**
 * Persist the OCR fields, and the derived status/notes only when no admin has ruled.
 * The check runs inside the transaction so an approval landing mid-batch still wins.
 *
 * @returns false when the decision fields were withheld.
 */
async function applyOcrResult(
  db: Firestore,
  registrantId: string,
  ocrFields: Record<string, unknown>,
  decisionFields: Record<string, unknown>
): Promise<boolean> {
  const regRef = db.collection('registrants').doc(registrantId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(regRef);
    if (!snapshot.exists) return false;

    const status = snapshot.data()?.status;
    if (typeof status === 'string' && HUMAN_DECIDED_STATUSES.has(status)) {
      transaction.update(regRef, ocrFields);
      return false;
    }

    transaction.update(regRef, { ...ocrFields, ...decisionFields });
    return true;
  });
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

  const regSnap = await db.collection('registrants').doc(registrantId).get();
  const track = regSnap.data()?.track;

  if (trackRequiresAttendanceQr(track)) {
    await stageAttendanceTicketOnBatch(batch, db, registrantId);
  }

  await batch.commit();
  return { success: true };
}
