import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { signTicket } from './hmac';
import { generateQrCodeDataUrl } from './generator';

async function buildAttendanceTicketFields(registrantId: string) {
  const qrToken = signTicket(registrantId);
  const qrImageUrl = await generateQrCodeDataUrl(registrantId);
  return {
    qrToken,
    qrImageUrl,
    used: false,
    usedAt: null,
    usedByUsherId: null,
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function issueAttendanceTicket(db: Firestore, registrantId: string): Promise<void> {
  const fields = await buildAttendanceTicketFields(registrantId);
  await db.collection('tickets').doc(registrantId).set(fields);
}

export async function stageAttendanceTicketOnBatch(
  batch: WriteBatch,
  db: Firestore,
  registrantId: string
): Promise<void> {
  const fields = await buildAttendanceTicketFields(registrantId);
  batch.set(db.collection('tickets').doc(registrantId), fields);
}
