import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { expandTicketCheckIns } from '@/lib/gateCheckIns';
import { cairoDateKey, mergeSessionDays } from '@/lib/eventDays';
import { trackRequiresAttendanceQr } from '@/lib/registrationTracks';
import { APPROVED_STATUSES } from '@/lib/registrantStatus';

export const runtime = 'nodejs';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Attendance roster: approved students × Tuesday/Saturday sessions.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const correlationId = randomUUID();

  try {
    const db = getAdminDb();

    const [registrantsSnap, ticketsSnap] = await Promise.all([
      db
        .collection('registrants')
        .where('status', 'in', APPROVED_STATUSES)
        .select('fullName', 'church', 'phoneNumber', 'track')
        .get(),
      db
        .collection('tickets')
        .select(
          'usedAt',
          'usedByUsherId',
          'registrantId',
          'registrantName',
          'church',
          'phoneNumber',
          'checkIns'
        )
        .get(),
    ]);

    const checkInsByRegistrant = new Map<string, Record<string, string | null>>();
    const ticketMetaByRegistrant = new Map<
      string,
      { registrantName: string; church: string; phoneNumber: string }
    >();

    for (const docSnap of ticketsSnap.docs) {
      const data = docSnap.data();
      const registrantId = asString(data.registrantId) || docSnap.id;
      const rows = expandTicketCheckIns({
        checkIns: data.checkIns,
        usedAt: data.usedAt,
        usedByUsherId: data.usedByUsherId,
      });
      const attended: Record<string, string | null> = checkInsByRegistrant.get(registrantId) ?? {};
      for (const row of rows) {
        const day = cairoDateKey(row.usedAt);
        if (!day) continue;
        attended[day] = row.usedAt;
      }
      checkInsByRegistrant.set(registrantId, attended);
      ticketMetaByRegistrant.set(registrantId, {
        registrantName: asString(data.registrantName),
        church: asString(data.church),
        phoneNumber: asString(data.phoneNumber),
      });
    }

    const students = registrantsSnap.docs
      .filter((docSnap) => {
        const data = docSnap.data();
        return trackRequiresAttendanceQr(data.track) || checkInsByRegistrant.has(docSnap.id);
      })
      .map((docSnap) => {
        const data = docSnap.data();
        const ticketMeta = ticketMetaByRegistrant.get(docSnap.id);
        const attended = checkInsByRegistrant.get(docSnap.id) ?? {};
        return {
          id: docSnap.id,
          registrantId: docSnap.id,
          registrantName: asString(data.fullName) || ticketMeta?.registrantName || '',
          church: asString(data.church) || ticketMeta?.church || '',
          phoneNumber: asString(data.phoneNumber) || ticketMeta?.phoneNumber || '',
          attended,
          attendedCount: Object.keys(attended).length,
        };
      });

    students.sort((a, b) => a.registrantName.localeCompare(b.registrantName, 'ar'));

    const extraDays = [...new Set(students.flatMap((student) => Object.keys(student.attended)))];

    return NextResponse.json({
      sessions: mergeSessionDays(extraDays),
      students,
    });
  } catch (error) {
    console.error(`[Admin attendance list] ${correlationId} failed:`, error);
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
