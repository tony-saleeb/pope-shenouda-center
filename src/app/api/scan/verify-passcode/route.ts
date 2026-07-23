import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';

export const DEFAULT_USHER_PASSCODE = process.env.USHER_PASSCODE || '102030';

/**
 * Get valid usher passcode from Firestore or fallback to default
 */
export async function getValidPasscode(): Promise<string> {
  try {
    const db = getAdminDb();
    const docSnap = await db.collection('settings').doc('config').get();
    if (docSnap.exists && docSnap.data()?.usherPasscode) {
      return String(docSnap.data()?.usherPasscode);
    }
  } catch {
    // Fallback on error
  }
  return DEFAULT_USHER_PASSCODE;
}

export async function POST(request: NextRequest) {
  try {
    const { passcode } = await request.json();
    if (!passcode) {
      return NextResponse.json({ valid: false, error: 'يرجى إدخال كود الماسح' }, { status: 400 });
    }

    const validPasscode = await getValidPasscode();

    if (String(passcode).trim() === validPasscode.trim()) {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ valid: false, error: 'كود الماسح غير صحيح' }, { status: 401 });
  } catch (error) {
    console.error('Verify passcode error:', error);
    return NextResponse.json({ valid: false, error: 'حدث خطأ في التحقق' }, { status: 500 });
  }
}
