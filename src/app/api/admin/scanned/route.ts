import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { expandTicketCheckIns } from '@/lib/gateCheckIns';

export const runtime = 'nodejs';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Gate check-ins for the admin scanned tab.
 * Reads used tickets without QR image blobs, then fills missing names from registrants.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection('tickets')
      .where('used', '==', true)
      .select(
        'usedAt',
        'usedByUsherId',
        'registrantId',
        'registrantName',
        'church',
        'phoneNumber',
        'checkIns'
      )
      .get();

    const items = snapshot.docs.flatMap((docSnap) => {
      const data = docSnap.data();
      const registrantId = asString(data.registrantId) || docSnap.id;
      const base = {
        registrantId,
        registrantName: asString(data.registrantName),
        church: asString(data.church),
        phoneNumber: asString(data.phoneNumber),
      };
      const checkIns = expandTicketCheckIns({
        checkIns: data.checkIns,
        usedAt: data.usedAt,
        usedByUsherId: data.usedByUsherId,
      });
      if (checkIns.length === 0) {
        return [];
      }
      return checkIns.map((entry, index) => ({
        id: `${docSnap.id}:${entry.usedAt ?? index}`,
        ...base,
        usedAt: entry.usedAt,
        usedByUsherId: entry.usedByUsherId,
      }));
    });

    const missingIds = [
      ...new Set(
        items
          .filter((item) => !item.registrantName || !item.church || !item.phoneNumber)
          .map((item) => item.registrantId)
          .filter(Boolean)
      ),
    ];

    const registrantById = new Map<
      string,
      { fullName: string; church: string; phoneNumber: string }
    >();

    const CHUNK = 100;
    for (let i = 0; i < missingIds.length; i += CHUNK) {
      const chunk = missingIds.slice(i, i + CHUNK);
      const refs = chunk.map((id) => db.collection('registrants').doc(id));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const data = snap.data() ?? {};
        registrantById.set(snap.id, {
          fullName: asString(data.fullName),
          church: asString(data.church),
          phoneNumber: asString(data.phoneNumber),
        });
      }
    }

    const hydrated = items.map((item) => {
      const extra = registrantById.get(item.registrantId);
      return {
        ...item,
        registrantName: item.registrantName || extra?.fullName || '',
        church: item.church || extra?.church || '',
        phoneNumber: item.phoneNumber || extra?.phoneNumber || '',
      };
    });

    hydrated.sort((a, b) => {
      const aTime = a.usedAt ? Date.parse(a.usedAt) : 0;
      const bTime = b.usedAt ? Date.parse(b.usedAt) : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ items: hydrated });
  } catch (error) {
    console.error(`[Admin scanned list] ${correlationId} failed:`, error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        messageAr: 'حدث خطأ، برجاء المحاولة مرة أخرى',
        correlationId,
      },
      { status: 500 }
    );
  }
}
