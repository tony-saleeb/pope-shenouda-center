import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import type { StaffRole } from '@/lib/types';

export const PRIMARY_ADMIN_EMAIL = 'tonysaleeb23@gmail.com';

/**
 * Check if a given email belongs to an authorized admin
 */
export async function isEmailAdmin(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (normalized === PRIMARY_ADMIN_EMAIL.toLowerCase()) return true;
  try {
    const db = getAdminDb();
    const docSnap = await db.collection('admins').doc(normalized).get();
    return docSnap.exists;
  } catch (err) {
    console.error('Error checking admin email:', err);
    return false;
  }
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

  // Extract role from custom claims or email lookup in Firestore admins collection
  const userEmail = decodedToken.email?.toLowerCase();
  const isAdminByEmail = userEmail ? await isEmailAdmin(userEmail) : false;
  const userRole = (decodedToken.role as StaffRole | undefined) || (isAdminByEmail ? 'admin' : undefined);
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  if (!userRole || !roles.includes(userRole)) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: 'غير مصرّح — صلاحيات غير كافية', code: 'forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { authorized: true, uid: decodedToken.uid, role: userRole, email: decodedToken.email };
}

/** Shorthand: require admin role */
export async function requireAdmin(request: NextRequest) {
  return requireRole(request, 'admin');
}

/** Shorthand: require usher or admin role */
export async function requireUsher(request: NextRequest) {
  return requireRole(request, ['usher', 'admin']);
}
