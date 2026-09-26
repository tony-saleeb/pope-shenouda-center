import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { signTicket } from './hmac';
import { generateQrCodeDataUrl } from './generator';

type QrFields = { qrToken: string; qrImageUrl: string };

/** Refresh the QR on an existing ticket. A full replace would erase check-ins. */
export function attendanceTicketWrite(ticketExists: boolean, qr: QrFields): {
  fields: Record<string, unknown>;
  merge: boolean;
} {
  if (ticketExists) {
    return { fields: { qrToken: qr.qrToken, qrImageUrl: qr.qrImageUrl }, merge: true };
  }
  return {
    fields: {
      qrToken: qr.qrToken,
      qrImageUrl: qr.qrImageUrl,
      used: false,
      usedAt: null,
      usedByUsherId: null,
      createdAt: FieldValue.serverTimestamp(),
    },
    merge: false,
  };
}

async function attendanceQrFields(registrantId: string): Promise<QrFields> {
  return {
    qrToken: signTicket(registrantId),
    qrImageUrl: await generateQrCodeDataUrl(registrantId),
  };
}

export async function issueAttendanceTicket(db: Firestore, registrantId: string): Promise<void> {
  const ref = db.collection('tickets').doc(registrantId);
  const [existing, qr] = await Promise.all([ref.get(), attendanceQrFields(registrantId)]);
  const write = attendanceTicketWrite(existing.exists, qr);
  await ref.set(write.fields, { merge: write.merge });
}

export async function stageAttendanceTicketOnBatch(
  batch: WriteBatch,
  db: Firestore,
  registrantId: string
): Promise<void> {
  const ref = db.collection('tickets').doc(registrantId);
  const [existing, qr] = await Promise.all([ref.get(), attendanceQrFields(registrantId)]);
  const write = attendanceTicketWrite(existing.exists, qr);
  batch.set(ref, write.fields, { merge: write.merge });
}
