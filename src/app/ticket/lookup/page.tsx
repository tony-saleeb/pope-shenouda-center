'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isValidEgyptianPhone, normalizePhone, VALIDATION_MESSAGES } from '@/lib/validation';
import Link from 'next/link';
import Header from '@/components/Header';

export default function TicketLookupPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [foundRegistrantId, setFoundRegistrantId] = useState<string | null>(null);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setNotFoundError(null);
    setFoundRegistrantId(null);

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
      const res = await fetch('/api/public/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setNotFoundError(data.messageAr || 'عفواً، هذا الرقم غير مسجّل لدينا. يرجى التأكد من كتابة الرقم بشكل صحيح أو القيام بالتسجيل أولاً.');
        } else {
          setError(data.messageAr || VALIDATION_MESSAGES.genericError);
        }
        setLoading(false);
        return;
      }

      if (data.registrantId) {
        router.push(`/status/${data.registrantId}`);
        return;
      }

      setSuccessMessage(data.messageAr || 'تم العثور على حسابك بنجاح!');
      setLoading(false);
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
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              التحقق من التذكرة
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.45)' }}>
              أدخل رقم الموبايل الذي قمت بالتسجيل به لاسترجاع التذكرة
            </p>
          </div>

          {/* Not Registered Error Card */}
          {notFoundError ? (
            <div style={{
              padding: '1.25rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '0.75rem',
              color: '#f87171',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}>
              <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>❌ الرقم غير مسجّل لدينا</p>
              <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)', marginBottom: '1.25rem' }}>
                {notFoundError}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                <Link
                  href="/register"
                  className="btn btn-primary btn-full"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  📝 التسجيل في الدورة الآن
                </Link>
                <button
                  onClick={() => { setNotFoundError(null); setError(null); }}
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: '0.25rem' }}
                >
                  جرب رقم آخر
                </button>
              </div>
            </div>
          ) : successMessage ? (
            /* Success Card */
            <div style={{
              padding: '1.25rem',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '0.75rem',
              color: '#34d399',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}>
              <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>✓ تم العثور على تسجيلك بنجاح!</p>
              <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.85)', marginBottom: '1.25rem' }}>
                {successMessage}
              </p>

              {foundRegistrantId ? (
                <Link
                  href={`/ticket/${foundRegistrantId}`}
                  className="btn btn-primary btn-full"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  🎟️ عرض وتنزيل التذكرة مباشرة
                </Link>
              ) : null}
            </div>
          ) : (
            /* Form */
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
                    <span>جاري البحث عن التذكرة...</span>
                  </>
                ) : (
                  <span>التحقق والبحث عن التذكرة</span>
                )}
              </button>
            </form>
          )}

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
