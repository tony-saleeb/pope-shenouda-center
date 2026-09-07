import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, isEmailAdmin } from '@/lib/auth/guards';
import type { StaffRole } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: 'غير مصرّح — يرجى تسجيل الدخول' }, { status: 401 });
  }

  const email = decoded.email?.toLowerCase();
  const claimed = decoded.role as StaffRole | undefined;

  let role: StaffRole | null = null;
  if (claimed === 'admin') {
    role = 'admin';
  } else {
    const isAdminByEmail = email ? await isEmailAdmin(email) : false;
    if (isAdminByEmail) {
      role = 'admin';
    } else if (claimed === 'usher') {
      role = 'usher';
    }
  }

  return NextResponse.json({ role, email: email || null });
}
