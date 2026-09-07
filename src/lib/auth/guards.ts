import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import type { StaffRole } from '@/lib/types';
import { PRIMARY_ADMIN_EMAIL, isPrimaryAdminEmail } from '@/lib/auth/primaryAdmin';

export { PRIMARY_ADMIN_EMAIL, isPrimaryAdminEmail };

const ADMIN_EMAIL_TTL_MS = 60_000;
const adminEmailCache = new Map<string, { ok: boolean; expiresAt: number }>();

/**
 * Check if a given email belongs to an authorized admin
 */
export async function isEmailAdmin(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (isPrimaryAdminEmail(normalized)) return true;

  const cached = adminEmailCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok;
  }

  try {
    const db = getAdminDb();
    const docSnap = await db.collection('admins').doc(normalized).get();
    const ok = docSnap.exists;
    adminEmailCache.set(normalized, { ok, expiresAt: Date.now() + ADMIN_EMAIL_TTL_MS });
    return ok;
  } catch (err) {
    console.error('Error checking admin email:', err);
    return false;
  }
}

export function invalidateAdminEmailCache(): void {
  adminEmailCache.clear();
}

/**
 * Extract and verify the Firebase ID token from an Authorization header.
 * Returns the decoded token with custom claims, or null if invalid.
 */
export async function verifyAuthToken(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    return await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return null;
  }
}

/**
 * Require a specific staff role for an API route.
 * Returns the decoded token if authorized, or a Response error if not.
 */
export async function requireRole(
  request: NextRequest,
  requiredRole: StaffRole | StaffRole[]
): Promise<
  | { authorized: true; uid: string; role: StaffRole; email?: string }
  | { authorized: false; response: Response }
> {
  const decodedToken = await verifyAuthToken(request);

  if (!decodedToken) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: 'غير مصرّح — يرجى تسجيل الدخول', code: 'unauthenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const claimed = decodedToken.role as StaffRole | undefined;
  if (claimed && roles.includes(claimed)) {
    return { authorized: true, uid: decodedToken.uid, role: claimed, email: decodedToken.email };
  }

  const userEmail = decodedToken.email?.toLowerCase();
  const isAdminByEmail = userEmail && roles.includes('admin') ? await isEmailAdmin(userEmail) : false;
  if (isAdminByEmail) {
    return { authorized: true, uid: decodedToken.uid, role: 'admin', email: decodedToken.email };
  }

  return {
    authorized: false,
    response: new Response(
      JSON.stringify({ error: 'غير مصرّح — صلاحيات غير كافية', code: 'forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ),
  };
}

/** Shorthand: require admin role */
export async function requireAdmin(request: NextRequest) {
  return requireRole(request, 'admin');
}

/** Shorthand: require usher or admin role */
export async function requireUsher(request: NextRequest) {
  return requireRole(request, ['usher', 'admin']);
}
