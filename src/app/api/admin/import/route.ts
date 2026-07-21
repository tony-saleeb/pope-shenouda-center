import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { FieldValue } from 'firebase-admin/firestore';
import Papa from 'papaparse';

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const body = await request.json();
    const db = getAdminDb();

    // Support both CSV text and manual entries
    if (body.csvText) {
      // Parse CSV
      const parsed = Papa.parse(body.csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      if (parsed.errors.length > 0) {
        return NextResponse.json(
          { error: 'CSV parsing error', details: parsed.errors },
          { status: 400 }
        );
      }

      const rows = parsed.data as Record<string, string>[];
      const batch = db.batch();
      let importedCount = 0;

      for (const row of rows) {
        // Flexible column name mapping
        const referenceNumber =
          row['reference'] || row['reference_number'] || row['ref'] || row['referencenumber'] || '';
        const amount = parseFloat(
          row['amount'] || row['مبلغ'] || row['المبلغ'] || '0'
        );
        const senderName =
          row['sender'] || row['sender_name'] || row['sendername'] || row['اسم المرسل'] || null;
        const transactionDate =
          row['date'] || row['transaction_date'] || row['transactiondate'] || row['التاريخ'] || '';

        if (!referenceNumber || isNaN(amount)) continue;

        const txRef = db.collection('bankTransactions').doc(referenceNumber.trim());
        batch.set(txRef, {
          amount,
          senderName: senderName || null,
          transactionDate: transactionDate
            ? FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
          matchedRegistrantId: null,
          importedAt: FieldValue.serverTimestamp(),
        }, { merge: false });

        importedCount++;
      }

      if (importedCount > 0) {
        await batch.commit();
      }

      return NextResponse.json({
        success: true,
        importedCount,
        totalRows: rows.length,
        message: `Imported ${importedCount} transactions`,
      });
    } else if (body.entries) {
      // Manual entries array
      const entries = body.entries as Array<{
        referenceNumber: string;
        amount: number;
        senderName?: string;
        transactionDate?: string;
      }>;

      const batch = db.batch();
      let importedCount = 0;

      for (const entry of entries) {
        if (!entry.referenceNumber || !entry.amount) continue;

        const txRef = db.collection('bankTransactions').doc(entry.referenceNumber.trim());
        batch.set(txRef, {
          amount: entry.amount,
          senderName: entry.senderName || null,
          transactionDate: FieldValue.serverTimestamp(),
          matchedRegistrantId: null,
          importedAt: FieldValue.serverTimestamp(),
        }, { merge: false });

        importedCount++;
      }

      if (importedCount > 0) {
        await batch.commit();
      }

      return NextResponse.json({
        success: true,
        importedCount,
        message: `Imported ${importedCount} transactions`,
      });
    } else {
      return NextResponse.json(
        { error: 'Provide either csvText or entries' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
