'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Registrant, RegistrantStatus } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';

// Status configuration with Arabic labels and styles
const STATUS_CONFIG: Record<RegistrantStatus, {
  titleAr: string;
  descAr: string;
  icon: string;
  color: string;
  bg: string;
  pulse: boolean;
}> = {
  pending_verification: {
    titleAr: 'جاري التحقق',
    descAr: 'تم استلام طلبك بنجاح وجاري التحقق من إيصال الدفع...',
    icon: '⏳',
    color: 'var(--color-accent-400)',
    bg: 'rgba(245, 158, 11, 0.1)',
    pulse: true,
  },
  auto_approved: {
    titleAr: 'تمت الموافقة!',
    descAr: 'تم التحقق من الدفع بنجاح — تذكرتك جاهزة',
    icon: '✅',
    color: 'var(--color-success-500)',
    bg: 'rgba(16, 185, 129, 0.1)',
    pulse: false,
  },
  manual_review: {
    titleAr: 'قيد المراجعة',
    descAr: 'طلبك قيد المراجعة وسيصلك التذكرة قريبًا. إذا تأخرت المراجعة تواصل معنا.',
    icon: '👀',
    color: 'var(--color-primary-400)',
    bg: 'rgba(79, 82, 247, 0.1)',
    pulse: true,
  },
  approved: {
    titleAr: 'تمت الموافقة!',
    descAr: 'تم التحقق من الدفع بنجاح — تذكرتك جاهزة',
    icon: '✅',
    color: 'var(--color-success-500)',
    bg: 'rgba(16, 185, 129, 0.1)',
    pulse: false,
  },
  rejected: {
    titleAr: 'تم الرفض',
    descAr: 'عذرًا، لم يتم التحقق من الدفع. تواصل معنا للمساعدة.',
    icon: '❌',
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
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>😕</p>
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
            fontSize: '2.5rem',
            position: 'relative',
          }}>
            {statusInfo.pulse && (
              <div style={{
                position: 'absolute',
                inset: '-4px',
                borderRadius: '50%',
                border: `2px solid ${statusInfo.color}`,
                opacity: 0.3,
                animation: 'pulse 2s ease-in-out infinite',
              }} />
            )}
            <span>{statusInfo.icon}</span>
          </div>

          {/* Status Title */}
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: statusInfo.color,
            marginBottom: '0.75rem',
          }}>
            {statusInfo.titleAr}
          </h1>

          {/* Status Description */}
          <p style={{
            fontSize: '1rem',
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.8,
            marginBottom: '2rem',
          }}>
            {statusInfo.descAr}
          </p>

          {/* Registrant Info */}
          <div style={{
            padding: '1.25rem',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '0.875rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem' }}>الاسم</span>
              <span style={{ fontWeight: 600 }}>{registrant.fullName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem' }}>الكنيسة</span>
              <span style={{ fontWeight: 600 }}>{registrant.church}</span>
            </div>
          </div>

          {/* Actions */}
          {isApproved && (
            <Link href={`/ticket/${registrantId}`} style={{ textDecoration: 'none' }}>
              <button className="btn btn-success btn-full btn-lg">
                <span>عرض التذكرة</span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </button>
            </Link>
          )}

          {registrant.status === 'manual_review' && (
            <p style={{
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.35)',
              marginTop: '0.5rem',
            }}>
              هذه الصفحة تتحدث تلقائيًا — لا تحتاج لتحديثها
            </p>
          )}

          {registrant.status === 'pending_verification' && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="spinner" style={{ margin: '0 auto', borderTopColor: statusInfo.color }} />
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
