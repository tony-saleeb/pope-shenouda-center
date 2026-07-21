'use client';

import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { isValidEgyptianPhone, normalizePhone, VALIDATION_MESSAGES } from '@/lib/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

export default function TicketLookupPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = normalizePhone(phone);

    if (!normalized) {
      setError(VALIDATION_MESSAGES.phoneRequired);
      return;
    }

    if (!isValidEgyptianPhone(normalized)) {
      setError(VALIDATION_MESSAGES.phoneInvalid);
      return;
    }

    setLoading(true);

    try {
      // Lookup registrantId from phoneIndex
      const phoneIndexRef = doc(db, 'phoneIndex', normalized);
      const phoneIndexSnap = await getDoc(phoneIndexRef);

      if (phoneIndexSnap.exists()) {
        const registrantId = phoneIndexSnap.data().registrantId;
        // Redirect to status page which will automatically display ticket if approved
        router.push(`/status/${registrantId}`);
      } else {
        setError('عذرًا، لم يتم العثور على أي تسجيل بهذا الرقم. تأكد من كتابة الرقم بشكل صحيح.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Lookup error:', err);
      setError('حدث خطأ أثناء البحث، يرجى المحاولة مرة أخرى.');
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="container-mobile" style={{ maxWidth: '26rem' }}>
        <div className="glass-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              margin: '0 auto 1.5rem',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}>
              🔍
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              التحقق من التذكرة
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.45)' }}>
              أدخل رقم الموبايل الذي قمت بالتسجيل به لعرض حالة طلبك وتذكرتك
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLookup} style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label className="form-label" htmlFor="phone">رقم الموبايل</label>
              <input
                id="phone"
                type="tel"
                className={`form-input ${error ? 'form-input-error' : ''}`}
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                dir="ltr"
                style={{ textAlign: 'left' }}
                inputMode="tel"
                autoFocus
              />
              {error && <p className="form-error">{error}</p>}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading || !phone}
              style={{ marginTop: '0.5rem' }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  <span>جاري البحث...</span>
                </>
              ) : (
                <span>تحقق الآن</span>
              )}
            </button>
          </form>

          {/* Back button */}
          <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.5rem' }}>
            <Link href="/" style={{
              fontSize: '0.875rem',
              color: 'var(--color-accent-400)',
              textDecoration: 'none',
              fontWeight: 600,
            }}>
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}
