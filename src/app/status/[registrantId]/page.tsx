'use client';

import { useEffect, useState } from 'react';
import type { Registrant, RegistrantStatus } from '@/lib/types';
import type { RegistrationTrack } from '@/lib/registrationTracks';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';

type StatusVisual = {
  renderIcon: () => React.ReactNode;
  color: string;
  bg: string;
  pulse: boolean;
};

const STATUS_VISUAL: Record<RegistrantStatus, StatusVisual> = {
  pending_verification: {
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.12)',
    pulse: true,
  },
  auto_approved: {
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
    renderIcon: () => (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    pulse: true,
  },
  approved: {
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

function statusTitleAr(status: RegistrantStatus, attendanceQrRequired: boolean): string {
  switch (status) {
    case 'pending_verification':
    case 'manual_review':
      return 'تم استلام طلبك بنجاح!';
    case 'auto_approved':
    case 'approved':
      return attendanceQrRequired
        ? 'تمت الموافقة وتفعيل كود الحضور!'
        : 'تمت الموافقة على تسجيلك!';
    case 'rejected':
      return 'لم يتم التحقق من الإيصال';
    default:
      return 'حالة التسجيل';
  }
}

function statusDescAr(status: RegistrantStatus, attendanceQrRequired: boolean): string {
  switch (status) {
    case 'pending_verification':
      return attendanceQrRequired
        ? 'تم استلام بياناتك وإيصال الدفع بنجاح — سيتم مراجعة الإيصال وإرسال رابط كود الحضور (QR) عبر الواتساب فور التأكيد.'
        : 'تم استلام بياناتك وإيصال الدفع بنجاح — سيتم مراجعة الإيصال وإعلامك عند اعتماده. مسار تسجيلك لا يتطلب كود حضور في المركز.';
    case 'manual_review':
      return attendanceQrRequired
        ? 'طلبك قيد المراجعة — سيصلك رابط كود الحضور (QR) عبر الواتساب فور تأكيد الإيصال.'
        : 'طلبك قيد المراجعة — سيتم إعلامك عند اعتماد الإيصال. مسار تسجيلك لا يتطلب كود حضور في المركز.';
    case 'auto_approved':
    case 'approved':
      return attendanceQrRequired
        ? 'تم التحقق من الدفع بنجاح — كود الحضور جاهز وسيُرسل أيضاً عبر الواتساب إن لم يصل بعد.'
        : 'تم التحقق من الدفع بنجاح — يمكنك متابعة الدورة حسب مسار تسجيلك (بدون كود حضور في المركز).';
    case 'rejected':
      return 'عذراً، تعذّر التحقق من صحة إيصال التحويل. يرجى التواصل مع الدعم الفني للمساعدة.';
    default:
      return '';
  }
}

interface PublicStatusResponse {
  status: RegistrantStatus;
  fullName: string;
  church: string;
  createdAt: string | null;
  track?: RegistrationTrack | null;
  attendanceQrRequired?: boolean;
  messageAr?: string;
  error?: string;
}

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const registrantId = params.registrantId as string;
  const [registrant, setRegistrant] = useState<Registrant | null>(null);
  const [attendanceQrRequired, setAttendanceQrRequired] = useState(false);
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
          track: data.track ?? undefined,
          createdAt: data.createdAt ? new Date(data.createdAt) : ({} as any),
        } as unknown as Registrant);
        setAttendanceQrRequired(Boolean(data.attendanceQrRequired));
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

    const intervalId = setInterval(fetchStatus, 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [registrantId]);

  useEffect(() => {
    if (
      attendanceQrRequired &&
      (registrant?.status === 'auto_approved' || registrant?.status === 'approved')
    ) {
      const timer = setTimeout(() => {
        router.push(`/ticket/${registrantId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [attendanceQrRequired, registrant?.status, registrantId, router]);

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

  const statusVisual = STATUS_VISUAL[registrant.status];
  const isApproved = registrant.status === 'auto_approved' || registrant.status === 'approved';
  const titleAr = statusTitleAr(registrant.status, attendanceQrRequired);
  const descAr = statusDescAr(registrant.status, attendanceQrRequired);
  const showPendingBanner =
    !isApproved && registrant.status !== 'rejected' && attendanceQrRequired;

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="container-mobile">
        <div className="glass-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          <div style={{
            width: '5rem',
            height: '5rem',
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            background: statusVisual.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {statusVisual.pulse && (
              <div style={{
                position: 'absolute',
                inset: '-0.5rem',
                borderRadius: '50%',
                border: `2px solid ${statusVisual.color}`,
                opacity: 0.4,
                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
              }} />
            )}
            {statusVisual.renderIcon()}
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: statusVisual.color, marginBottom: '0.5rem' }}>
            {titleAr}
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem', lineHeight: 1.6 }}>
            {descAr}
          </p>

          {showPendingBanner && (
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
                <span>سيتم إرسال كود الحضور عبر الواتساب</span>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.8)', margin: 0, lineHeight: 1.6 }}>
                سيصلك رابط كود الحضور (QR) فوراً عبر رسالة واتساب بمجرد اعتماد الإيصال.
              </p>
            </div>
          )}

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

          {isApproved && attendanceQrRequired ? (
            <div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-success-500)', marginBottom: '1rem' }}>
                جاري توجيهك لكود الحضور تلقائيًا...
              </p>
              <Link
                href={`/ticket/${registrantId}`}
                className="btn btn-accent btn-full"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                عرض كود الحضور الآن ➔
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
