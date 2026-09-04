import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { PENDING_REVIEW_STATUSES } from '@/lib/registrantStatus';

export const REVIEW_QUEUE_COLLECTION = 'meta';
export const REVIEW_QUEUE_DOC = 'reviewQueue';

export async function syncReviewQueueCount(db: Firestore): Promise<number> {
  const registrants = db.collection('registrants');
  const counts = await Promise.all(
    PENDING_REVIEW_STATUSES.map(async (status) => {
      const snap = await registrants.where('status', '==', status).count().get();
      return snap.data().count;
    })
  );
  const count = counts.reduce((sum, value) => sum + value, 0);
  await db.collection(REVIEW_QUEUE_COLLECTION).doc(REVIEW_QUEUE_DOC).set({
    count,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return count;
}

export function scheduleReviewQueueSync(db: Firestore): void {
  void syncReviewQueueCount(db).catch((error) => {
    console.error('Review queue sync failed:', error);
  });
}
