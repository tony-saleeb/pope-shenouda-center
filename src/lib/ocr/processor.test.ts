import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('./visionApi', () => ({
  processOcrBatch: vi.fn(),
}));

vi.mock('@/lib/qr/hmac', () => ({
  signTicket: vi.fn().mockReturnValue('signed-token'),
}));

vi.mock('@/lib/qr/generator', () => ({
  generateQrCodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
}));

import { getAdminDb } from '@/lib/firebase/admin';
import { processOcrBatch } from './visionApi';
import { processRegistrantOcrBatch } from './processor';

/**
 * Minimal in-memory Firestore double: enough surface for the processor's
 * getAll / batch / runTransaction usage.
 */
function createDb(docs: Record<string, Record<string, unknown>>) {
  const writes: Array<{ id: string; data: Record<string, unknown> }> = [];

  const docRef = (id: string) => ({ id, __id: id });

  const applyWrite = (ref: { __id: string }, data: Record<string, unknown>) => {
    writes.push({ id: ref.__id, data });
    Object.assign(docs[ref.__id], data);
  };

  const db = {
    collection: () => ({ doc: (id: string) => docRef(id) }),

    getAll: async (...refs: Array<{ __id: string }>) =>
      refs.map((ref) => ({
        id: ref.__id,
        exists: ref.__id in docs,
        data: () => docs[ref.__id],
      })),

    batch: () => ({
      update: applyWrite,
      commit: async () => undefined,
    }),

    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({
        get: async (ref: { __id: string }) => ({
          exists: ref.__id in docs,
          data: () => docs[ref.__id],
        }),
        update: applyWrite,
      }),
  };

  return { db, writes };
}

/** Every field the processor wrote to a given registrant, merged. */
function writesFor(writes: Array<{ id: string; data: Record<string, unknown> }>, id: string) {
  return writes.filter((w) => w.id === id).reduce((acc, w) => ({ ...acc, ...w.data }), {});
}

describe('processRegistrantOcrBatch — admin decisions are final', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never re-processes or overwrites an approved registrant', async () => {
    const { db, writes } = createDb({
      'reg-approved': {
        status: 'approved',
        ocrStatus: 'queued',
        adminNotes: 'تمت الموافقة يدوياً',
        verifiedAt: 'original-timestamp',
      },
    });
    (getAdminDb as any).mockReturnValue(db);

    const results = await processRegistrantOcrBatch([
      { id: 'reg-approved', url: 'data:image/jpeg;base64,AAAA' },
    ]);

    // The OCR API is never called for a decided registrant — no cost, no clobber.
    expect(processOcrBatch).not.toHaveBeenCalled();

    const doc = writesFor(writes, 'reg-approved');
    expect(doc).toEqual({ ocrStatus: 'skipped' });

    expect(results).toEqual([{ id: 'reg-approved', success: true, status: 'skipped' }]);
  });

  it('never overwrites a rejected registrant', async () => {
    const { db, writes } = createDb({
      'reg-rejected': { status: 'rejected', ocrStatus: 'queued', adminNotes: 'إيصال غير صالح' },
    });
    (getAdminDb as any).mockReturnValue(db);

    await processRegistrantOcrBatch([{ id: 'reg-rejected', url: 'data:image/jpeg;base64,AAAA' }]);

    expect(processOcrBatch).not.toHaveBeenCalled();
    expect(writesFor(writes, 'reg-rejected')).toEqual({ ocrStatus: 'skipped' });
  });

  it('still processes undecided registrants normally', async () => {
    const { db, writes } = createDb({
      'reg-pending': { status: 'pending_verification', ocrStatus: 'queued', adminNotes: null },
    });
    (getAdminDb as any).mockReturnValue(db);

    (processOcrBatch as any).mockResolvedValue({
      results: [
        {
          id: 'reg-pending',
          reference_number: null,
          amount: null,
          sender_name: null,
          confidence: 'low',
          notes: 'غير واضح',
        },
      ],
    });

    const results = await processRegistrantOcrBatch([
      { id: 'reg-pending', url: 'data:image/jpeg;base64,AAAA' },
    ]);

    expect(processOcrBatch).toHaveBeenCalledOnce();

    const doc = writesFor(writes, 'reg-pending') as Record<string, unknown>;
    expect(doc.ocrStatus).toBe('done');
    expect(doc.status).toBe('manual_review');
    expect(doc.adminNotes).toBe('غير واضح');

    expect(results).toEqual([{ id: 'reg-pending', success: true, status: 'manual_review' }]);
  });

  it('withholds the status when an approval lands mid-batch', async () => {
    const docs: Record<string, Record<string, unknown>> = {
      'reg-race': { status: 'pending_verification', ocrStatus: 'queued', adminNotes: null },
    };
    const { db, writes } = createDb(docs);
    (getAdminDb as any).mockReturnValue(db);

    // The admin approves while the OCR call is in flight.
    (processOcrBatch as any).mockImplementation(async () => {
      docs['reg-race'].status = 'approved';
      docs['reg-race'].adminNotes = 'تمت الموافقة يدوياً';
      return {
        results: [
          {
            id: 'reg-race',
            reference_number: null,
            amount: null,
            sender_name: null,
            confidence: 'low',
            notes: 'غير واضح',
          },
        ],
      };
    });

    const results = await processRegistrantOcrBatch([
      { id: 'reg-race', url: 'data:image/jpeg;base64,AAAA' },
    ]);

    // OCR findings are kept, but the decision and the admin's note survive.
    expect(docs['reg-race'].status).toBe('approved');
    expect(docs['reg-race'].adminNotes).toBe('تمت الموافقة يدوياً');
    expect(writesFor(writes, 'reg-race')).toMatchObject({ ocrStatus: 'done' });
    expect(results).toEqual([{ id: 'reg-race', success: true, status: 'skipped' }]);
  });

  it('does not mark decided registrants manual_review when the OCR API is down', async () => {
    const { db } = createDb({
      'reg-approved': { status: 'approved', ocrStatus: 'queued', adminNotes: 'موافق' },
      'reg-pending': { status: 'pending_verification', ocrStatus: 'queued', adminNotes: null },
    });
    (getAdminDb as any).mockReturnValue(db);

    (processOcrBatch as any).mockRejectedValue(new Error('OCR API unreachable'));

    const results = await processRegistrantOcrBatch([
      { id: 'reg-approved', url: 'data:image/jpeg;base64,AAAA' },
      { id: 'reg-pending', url: 'data:image/jpeg;base64,BBBB' },
    ]);

    const approved = results.find((r) => r.id === 'reg-approved');
    const pending = results.find((r) => r.id === 'reg-pending');

    expect(approved).toEqual({ id: 'reg-approved', success: true, status: 'skipped' });
    expect(pending?.success).toBe(false);
  });
});
