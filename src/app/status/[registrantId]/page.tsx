'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Registrant, RegistrantStatus } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';

// Status configuration with Arabic labels, styles, and SVG icons
const STATUS_CONFIG: Record<RegistrantStatus, {
  titleAr: string;
  descAr: string;
  renderIcon: () => React.ReactNode;
  color: string;
  bg: string;
  pulse: boolean;
}> = {
  pending_verification: {
    titleAr: 'جاري التحقق',
    descAr: 'تم استلام طلبك بنجاح وجاري التحقق من إيصال الدفع...',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    color: 'var(--color-accent-400)',
    bg: 'rgba(245, 158, 11, 0.1)',
    pulse: true,
  },
  auto_approved: {
    titleAr: 'تمت الموافقة!',
    descAr: 'تم التحقق من الدفع بنجاح — تذكرتك جاهزة',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    color: 'var(--color-success-500)',
    bg: 'rgba(16, 185, 129, 0.1)',
    pulse: false,
  },
  manual_review: {
    titleAr: 'قيد المراجعة',
    descAr: 'طلبك قيد المراجعة وسيصلك التذكرة قريبًا. إذا تأخرت المراجعة تواصل معنا.',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    color: 'var(--color-primary-400)',
    bg: 'rgba(79, 82, 247, 0.1)',
    pulse: true,
  },
  approved: {
    titleAr: 'تمت الموافقة!',
    descAr: 'تم التحقق من الدفع بنجاح — تذكرتك جاهزة',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    color: 'var(--color-success-500)',
    bg: 'rgba(16, 185, 129, 0.1)',
    pulse: false,
  },
  rejected: {
    titleAr: 'تم الرفض',
    descAr: 'عذرًا، لم يتم التحقق من الدفع. تواصل معنا للمساعدة.',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    color: 'var(--color-error-500)',
    bg: 'rgba(239, 68, 68, 0.1)',
    pulse: false,
  },
};

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const registrantId = params.registrantId as string;
  const [registrant, setRegistrant] = useState<Registrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyStatusUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  useEffect(() => {
    if (!registrantId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'registrants', registrantId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError('لم يتم العثور على هذا التسجيل');
          setLoading(false);
          return;
        }
        setRegistrant(snapshot.data() as Registrant);
        setLoading(false);
      },
      (err) => {
        console.error('Status listener error:', err);
        setError('حدث خطأ في تحميل حالة التسجيل');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [registrantId]);

  // Auto-redirect to ticket page when approved
  useEffect(() => {
    if (registrant?.status === 'auto_approved' || registrant?.status === 'approved') {
      const timer = setTimeout(() => {
        router.push(`/ticket/${registrantId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [registrant?.status, registrantId, router]);

  if (loading) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 1.5rem', borderTopColor: 'var(--color-primary-500)' }} />
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>جاري التحميل...</p>
        </div>
      </main>
    );
  }

  if (error || !registrant) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '28rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>{error || 'حدث خطأ'}</p>
          <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem', textDecoration: 'none', display: 'inline-flex' }}>
            العودة للصفحة الرئيسية
          </Link>
        </div>
      </main>
    );
  }

  const statusInfo = STATUS_CONFIG[registrant.status];
  const isApproved = registrant.status === 'auto_approved' || registrant.status === 'approved';

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="container-mobile">
        <div className="glass-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          {/* Status Icon */}
          <div style={{
            width: '5rem',
            height: '5rem',
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            background: statusInfo.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {statusInfo.pulse && (
              <div style={{
                position: 'absolute',
                inset: '-0.5rem',
                borderRadius: '50%',
                border: `2px solid ${statusInfo.color}`,
                opacity: 0.4,
                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
              }} />
            )}
            {statusInfo.renderIcon()}
          </div>

          {/* Status Title & Description */}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: statusInfo.color, marginBottom: '0.5rem' }}>
            {statusInfo.titleAr}
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem', lineHeight: 1.6 }}>
            {statusInfo.descAr}
          </p>

          {/* Registrant Details Card */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '1rem',
            padding: '1.25rem',
            marginBottom: '2rem',
            textAlign: 'right',
            display: 'grid',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>الاسم:</span>
              <span style={{ fontWeight: 600 }}>{registrant.fullName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>الكنيسة:</span>
              <span style={{ fontWeight: 600 }}>{registrant.church}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>رقم الموبايل:</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{registrant.phoneNumber}</span>
            </div>
          </div>

          {/* Action Links */}
          {isApproved ? (
            <div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-success-500)', marginBottom: '1rem' }}>
                جاري توجيهك للتذكرة تلقائيًا...
              </p>
              <Link
                href={`/ticket/${registrantId}`}
                className="btn btn-accent btn-full"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                عرض التذكرة الآن ➔
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <button
                onClick={copyStatusUrl}
                className="btn btn-ghost btn-full"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copied ? 'تم نسخ رابط المتابعة ✓' : 'نسخ رابط متابعة الطلب'}</span>
              </button>

              <Link
                href="/"
                className="btn btn-ghost btn-full"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
              >
                العودة للصفحة الرئيسية
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
