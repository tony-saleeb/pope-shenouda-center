import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin, PRIMARY_ADMIN_EMAIL } from '@/lib/auth/guards';
import { FieldValue } from 'firebase-admin/firestore';

export interface AdminUserRecord {
  email: string;
  isPrimary: boolean;
  hasAuthAccount: boolean;
  createdAt?: string;
  addedBy?: string;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const db = getAdminDb();
    const snapshot = await db.collection('admins').get();

    const adminMap = new Map<string, { createdAt?: string; addedBy?: string }>();

    // Primary admin is always included
    adminMap.set(PRIMARY_ADMIN_EMAIL.toLowerCase(), {
      addedBy: 'النظام الرئاسي',
    });

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const email = doc.id.toLowerCase();
      adminMap.set(email, {
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        addedBy: data.addedBy || 'أدمن',
      });
    });

    const admins: AdminUserRecord[] = [];

    for (const [email, meta] of adminMap.entries()) {
      let hasAuthAccount = false;
      try {
        await getAdminAuth().getUserByEmail(email);
        hasAuthAccount = true;
      } catch {
        hasAuthAccount = false;
      }

      admins.push({
        email,
        isPrimary: email === PRIMARY_ADMIN_EMAIL.toLowerCase(),
        hasAuthAccount,
        createdAt: meta.createdAt,
        addedBy: meta.addedBy,
      });
    }

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('Fetch admins error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب قائمة الأدمن' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const { email, password } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'يرجى إدخال بريد إلكتروني صحيح' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = getAdminDb();
    const auth = getAdminAuth();

    let uid: string | null = null;
    let createdAccount = false;

    try {
      const existingUser = await auth.getUserByEmail(normalizedEmail);
      uid = existingUser.uid;
      // Grant custom claim
      await auth.setCustomUserClaims(uid, { role: 'admin' });

      if (password && password.length >= 6) {
        await auth.updateUser(uid, { password });
      }
    } catch {
      // User does not exist in Firebase Auth yet
      if (password && password.length >= 6) {
        const newUser = await auth.createUser({
          email: normalizedEmail,
          password,
          emailVerified: true,
        });
        uid = newUser.uid;
        await auth.setCustomUserClaims(uid, { role: 'admin' });
        createdAccount = true;
      }
    }

    // Record in Firestore admins collection
    await db.collection('admins').doc(normalizedEmail).set({
      email: normalizedEmail,
      addedBy: authResult.email || 'Admin',
      createdAt: FieldValue.serverTimestamp(),
      authUid: uid || null,
    });

    return NextResponse.json({
      success: true,
      message: createdAccount
        ? `تم إنشاء حساب الأدمن (${normalizedEmail}) بنجاح`
        : `تم إضافة (${normalizedEmail}) كأدمن معتمد بنجاح`,
      email: normalizedEmail,
    });
  } catch (error) {
    console.error('Add admin error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `خطأ في إضافة الأدمن: ${errorMessage}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (normalizedEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'لا يمكن حذف حساب الأدمن الرئيسي للنظام' }, { status: 400 });
    }

    const db = getAdminDb();
    const auth = getAdminAuth();

    // Remove from Firestore
    await db.collection('admins').doc(normalizedEmail).delete();

    // Revoke custom claims in Firebase Auth if user exists
    try {
      const user = await auth.getUserByEmail(normalizedEmail);
      await auth.setCustomUserClaims(user.uid, { role: null });
    } catch {
      // Ignore if user not found in Auth
    }

    return NextResponse.json({
      success: true,
      message: `تم إلغاء صلاحيات الأدمن عن (${normalizedEmail}) بنجاح`,
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `خطأ في حذف الأدمن: ${errorMessage}` }, { status: 500 });
  }
}
