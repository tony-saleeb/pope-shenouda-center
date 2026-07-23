import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const registrantId = formData.get('registrantId') as string | null;

    if (!file || !registrantId) {
      return NextResponse.json({ error: 'ملف أو معرّف مفقود' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم الصورة كبير جداً (الحجم الأقصى 10 ميجابايت)' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = getAdminStorage().bucket(bucketName);

    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const destinationPath = `screenshots/${registrantId}/${Date.now()}_${sanitizedFileName}`;
    const fileRef = bucket.file(destinationPath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type || 'image/jpeg',
      },
    });

    // Make public if supported, or construct public storage URL
    try {
      await fileRef.makePublic();
    } catch {
      // Ignore if ACLs are disabled on bucket
    }

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destinationPath)}?alt=media`;

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Server upload failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'فشل رفع صورة الإيصال',
    }, { status: 500 });
  }
}
