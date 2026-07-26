/**
 * Door scanner passcode verification endpoint.
 *
 * NOTE: The usher passcode is a shared fallback credential. For better auditability
 * and individual usher attribution, per-usher Firebase accounts with the custom claim
 * `role: 'usher'` (supported by `requireUsher` / `verifyAuthToken`) are the preferred
 * authentication path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdminDb } from '@/lib/firebase/admin';
import { getUsherPasscode } from '@/lib/env';
import { getLimiter, limitByIp } from '@/lib/ratelimit';

/** Rate limiter for passcode attempts: 5 requests per 15 minutes per IP. */
const verifyPasscodeLimiter = getLimiter('verify-passcode', 5, '15 m');

/**
 * Constant-time passcode comparison.
 * Length-guard first to avoid timingSafeEqual length mismatch throw.
 */
function passcodeMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Get valid usher passcode from Firestore config, falling back to USHER_PASSCODE env variable.
 * Throws if error occurs fetching from Firestore or if USHER_PASSCODE env var is unset.
 */
export async function getValidPasscode(): Promise<string> {
  try {
    const db = getAdminDb();
    const docSnap = await db.collection('settings').doc('config').get();
    if (docSnap.exists && docSnap.data()?.usherPasscode) {
      return String(docSnap.data()?.usherPasscode);
    }
  } catch (err) {
    console.error('Error fetching usher passcode from Firestore config:', err);
    throw err;
  }
  return getUsherPasscode();
}

export async function POST(request: NextRequest) {
  // Rate-limit passcode attempts to prevent brute-force attacks
  const limitedResponse = await limitByIp(request, verifyPasscodeLimiter);
  if (limitedResponse) {
    return limitedResponse;
  }

  try {
    const { passcode } = await request.json();
    if (!passcode) {
      return NextResponse.json({ valid: false, error: 'يرجى إدخال كود الماسح' }, { status: 400 });
    }

    const validPasscode = await getValidPasscode();

    if (passcodeMatches(String(passcode), validPasscode)) {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ valid: false, error: 'كود الماسح غير صحيح' }, { status: 401 });
  } catch (error) {
    console.error('Verify passcode error:', error);
    return NextResponse.json({ valid: false, error: 'حدث خطأ في التحقق' }, { status: 500 });
  }
}
