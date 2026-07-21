'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';

export default function ImportPage() {
  const { user } = useAuth();
  const [csvText, setCsvText] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualSender, setManualSender] = useState('');
  const [importing, setImporting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'success' | 'error'>('success');

  const handleCsvImport = async () => {
    if (!csvText.trim() || !user) return;
    setImporting(true);
    setResult(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ csvText }),
      });

      const data = await response.json();
      if (response.ok) {
        setResultType('success');
        setResult(`تم استيراد ${data.importedCount} معاملة بنجاح`);
        setCsvText('');
      } else {
        setResultType('error');
        setResult(data.error || 'حدث خطأ في الاستيراد');
      }
    } catch {
      setResultType('error');
      setResult('حدث خطأ في الاتصال');
    } finally {
      setImporting(false);
    }
  };

  const handleManualEntry = async () => {
    if (!manualRef.trim() || !manualAmount || !user) return;
    setImporting(true);
    setResult(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entries: [{
            referenceNumber: manualRef.trim(),
            amount: parseFloat(manualAmount),
            senderName: manualSender || null,
          }],
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setResultType('success');
        setResult('تم إضافة المعاملة بنجاح');
        setManualRef('');
        setManualAmount('');
        setManualSender('');
      } else {
        setResultType('error');
        setResult(data.error || 'حدث خطأ');
      }
    } catch {
      setResultType('error');
      setResult('حدث خطأ في الاتصال');
    } finally {
      setImporting(false);
    }
  };

  const handleReconcile = async () => {
    if (!user) return;
    setReconciling(true);
    setResult(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (response.ok) {
        setResultType('success');
        setResult(
          `تمت المطابقة: ${data.matched} موافقة تلقائية، ${data.duplicates} مكرر، ${data.reviewed} تم تحويلها للمراجعة اليدوية`
        );
      } else {
        setResultType('error');
        setResult(data.error || 'حدث خطأ أثناء تنفيذ المطابقة');
      }
    } catch {
      setResultType('error');
      setResult('حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: '2.5rem',
        borderBottom: '1px solid rgba(242, 158, 19, 0.12)',
        paddingBottom: '1.25rem',
      }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.25rem' }}>
          كشف الحساب البنكي
        </h1>
        <p style={{ color: 'rgba(247, 240, 228, 0.55)', fontSize: '0.875rem' }}>
          استيراد المعاملات البنكية ومطابقتها الآلية مع بيانات المستخرجات
        </p>
      </div>

      {/* Result Alert */}
      {result && (
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.875rem',
          marginBottom: '1.75rem',
          background: resultType === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${resultType === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: resultType === 'success' ? '#10b981' : '#f87171',
          fontWeight: 700,
          fontSize: '0.9375rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
        }}>
          {resultType === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          <span>{result}</span>
        </div>
      )}

      {/* Two Column Section */}
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))' }}>
        {/* CSV Import */}
        <div className="glass-card" style={{ padding: '1.75rem', border: '1px solid rgba(242, 158, 19, 0.2)', background: 'rgba(31, 19, 6, 0.65)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{
              width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem',
              background: 'rgba(242, 158, 19, 0.15)', border: '1px solid rgba(242, 158, 19, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbba33',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f7f0e4' }}>
              استيراد ملف CSV
            </h2>
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'rgba(247, 240, 228, 0.55)', marginBottom: '1rem', lineHeight: 1.6 }}>
            الصق محتوى ملف CSV هنا. الأعمدة المطلوبة: <code>reference</code>, <code>amount</code>
          </p>

          <textarea
            className="form-input"
            placeholder="reference,amount,sender,date&#10;ABC123,150,John Doe,2024-01-15&#10;DEF456,150,Jane Smith,2024-01-15"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={7}
            dir="ltr"
            style={{
              textAlign: 'left',
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              resize: 'vertical',
              background: 'rgba(12, 7, 3, 0.7)',
              borderColor: 'rgba(242, 158, 19, 0.2)',
              color: '#e5c185',
            }}
          />

          <button
            className="btn btn-primary btn-full"
            onClick={handleCsvImport}
            disabled={importing || !csvText.trim()}
            style={{ marginTop: '1.25rem' }}
          >
            {importing ? (
              <><span className="spinner" /> جاري الاستيراد...</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>استيراد بيانات CSV</span>
              </>
            )}
          </button>
        </div>

        {/* Manual Entry */}
        <div className="glass-card" style={{ padding: '1.75rem', border: '1px solid rgba(242, 158, 19, 0.2)', background: 'rgba(31, 19, 6, 0.65)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{
              width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem',
              background: 'rgba(242, 158, 19, 0.15)', border: '1px solid rgba(242, 158, 19, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbba33',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f7f0e4' }}>
              إدخال معاملة يدويًا
            </h2>
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'rgba(247, 240, 228, 0.55)', marginBottom: '1rem', lineHeight: 1.6 }}>
            إضافة معاملة بنكية منفردة إلى قاعدة البيانات
          </p>

          <div style={{ display: 'grid', gap: '0.875rem' }}>
            <div>
              <label className="form-label" style={{ color: 'rgba(247, 240, 228, 0.8)' }}>رقم المرجع (Ref)</label>
              <input
                className="form-input"
                placeholder="ABC123456"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
                dir="ltr"
                style={{ textAlign: 'left', background: 'rgba(12, 7, 3, 0.7)', borderColor: 'rgba(242, 158, 19, 0.2)', color: '#f7f0e4' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ color: 'rgba(247, 240, 228, 0.8)' }}>المبلغ (جنيه)</label>
              <input
                className="form-input"
                type="number"
                placeholder="150"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                dir="ltr"
                style={{ textAlign: 'left', background: 'rgba(12, 7, 3, 0.7)', borderColor: 'rgba(242, 158, 19, 0.2)', color: '#f7f0e4' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ color: 'rgba(247, 240, 228, 0.8)' }}>اسم المرسل (اختياري)</label>
              <input
                className="form-input"
                placeholder="اسم صاحب الحساب المحول"
                value={manualSender}
                onChange={(e) => setManualSender(e.target.value)}
                style={{ background: 'rgba(12, 7, 3, 0.7)', borderColor: 'rgba(242, 158, 19, 0.2)', color: '#f7f0e4' }}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={handleManualEntry}
            disabled={importing || !manualRef.trim() || !manualAmount}
            style={{ marginTop: '1.25rem' }}
          >
            {importing ? (
              <><span className="spinner" /> جاري الإضافة...</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>حفظ المعاملة</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reconcile Section */}
      <div className="glass-card" style={{
        marginTop: '2rem',
        padding: '2rem',
        textAlign: 'center',
        border: '1px solid rgba(242, 158, 19, 0.25)',
        background: 'rgba(31, 19, 6, 0.75)',
      }}>
        <div style={{
          width: '3.5rem', height: '3.5rem', borderRadius: '1rem',
          background: 'linear-gradient(135deg, rgba(242, 158, 19, 0.25), rgba(179, 130, 63, 0.15))',
          border: '1px solid rgba(242, 158, 19, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem', color: '#fbba33',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </div>

        <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
          مطابقة المعاملات التلقائية
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'rgba(247, 240, 228, 0.6)', marginBottom: '1.5rem', maxWidth: '30rem', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
          تشغيل خوارزمية المطابقة لمقارنة أرقام المراجع والمبالغ المستخرجة من الإيصالات مع كشف الحساب البنكي.
        </p>

        <button
          className="btn btn-accent btn-lg"
          onClick={handleReconcile}
          disabled={reconciling}
          style={{ minWidth: '18rem', margin: '0 auto' }}
        >
          {reconciling ? (
            <><span className="spinner" /> جاري التشغيل والمطابقة...</>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>تشغيل خوارزمية المطابقة الآن</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
