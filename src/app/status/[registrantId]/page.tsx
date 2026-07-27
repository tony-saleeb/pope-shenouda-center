'use client';

import { useEffect, useState } from 'react';
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
    titleAr: 'تم استلام طلبك بنجاح!',
    descAr: 'تم استلام بياناتك وإيصال الدفع بنجاح — سيتم مراجعة الإيصال وإرسال التذكرة الإلكترونية (كود QR) مباشرة إلى حساب الواتساب الخاص بك فور التأكيد.',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    pulse: true,
  },
  auto_approved: {
    titleAr: 'تمت الموافقة وتفعيل التذكرة!',
    descAr: 'تم التحقق من الدفع بنجاح — تذكرتك جاهزة وسيتم إرسالها أيضاً عبر الواتساب',
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
    titleAr: 'تم استلام طلبك بنجاح!',
    descAr: 'طلبك قيد المراجعة حالياً وسوف تصلك التذكرة الإلكترونية مباشرة عبر الواتساب على رقم الموبايل المسجل فور تأكيد الإيصال.',
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    pulse: true,
  },
  approved: {
    titleAr: 'تمت الموافقة وتفعيل التذكرة!',
    descAr: 'تم التحقق من الدفع بنجاح — تذكرتك جاهزة وسيتم إرسالها أيضاً عبر الواتساب',
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
    titleAr: 'لم يتم التحقق من الإيصال',
    descAr: 'عذراً، تعذّر التحقق من صحة إيصال التحويل. يرجى التواصل مع الدعم الفني للمساعدة.',
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

interface PublicStatusResponse {
  status: RegistrantStatus;
  fullName: string;
  church: string;
  createdAt: string | null;
  messageAr?: string;
  error?: string;
}

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

    let isMounted = true;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/public/status/${registrantId}`, {
          cache: 'no-store',
        });
        const data: PublicStatusResponse = await res.json();

        if (!isMounted) return;

        if (!res.ok) {
          setError(data.messageAr || 'لم يتم العثور على هذا التسجيل');
          setLoading(false);
          return;
        }

        setRegistrant({
          id: registrantId,
          status: data.status,
          fullName: data.fullName,
          church: data.church,
          createdAt: data.createdAt ? new Date(data.createdAt) : ({} as any),
        } as unknown as Registrant);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        console.error('Status fetch error:', err);
        setError('حدث خطأ في تحميل حالة التسجيل');
        setLoading(false);
      }
    }

    fetchStatus();

    // Poll every 15 seconds for status updates
    const intervalId = setInterval(fetchStatus, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
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

          {/* WhatsApp Ticket Delivery Banner */}
          {!isApproved && registrant.status !== 'rejected' && (
            <div style={{
              background: 'rgba(37, 211, 102, 0.08)',
              border: '1px solid rgba(37, 211, 102, 0.25)',
              borderRadius: '1rem',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              textAlign: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#25D366', fontWeight: 800, fontSize: '0.9375rem', marginBottom: '0.35rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.758.459 3.474 1.33 4.988l-1.413 5.164 5.283-1.386c1.464.798 3.116 1.218 4.79 1.218h.004c5.505 0 9.987-4.479 9.988-9.986 0-2.668-1.038-5.176-2.925-7.062s-4.395-2.922-7.067-2.922zm0 1.667c4.586 0 8.318 3.731 8.319 8.317 0 2.227-.867 4.321-2.443 5.897s-3.67 2.443-5.895 2.443h-.003c-1.472 0-2.915-.395-4.175-1.144l-.299-.178-3.104.814.828-3.025-.195-.311c-.822-1.309-1.257-2.825-1.257-4.373.001-4.586 3.733-8.317 8.324-8.317z"/>
                </svg>
                <span>سيتم إرسال التذكرة عبر الواتساب</span>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.8)', margin: 0, lineHeight: 1.6 }}>
                سيصلك كود الـ QR والتذكرة الإلكترونية فوراً عبر رسالة واتساب بمجرد اعتماد الإيصال.
              </p>
            </div>
          )}

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
            {registrant.phoneNumber && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>رقم الموبايل:</span>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{registrant.phoneNumber}</span>
              </div>
            )}
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
