'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import PaymentInstructionsModal from '@/components/PaymentInstructionsModal';

export default function HomePage() {
  const router = useRouter();
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', maxWidth: '32rem', margin: '0 auto' }}>
        {/* Conference Logo Badge */}
        <div style={{
          width: '6.5rem',
          height: '6.5rem',
          margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: '#ffffff',
          border: '2px solid #fbba33',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(251, 186, 51, 0.35)',
          padding: '0.625rem',
        }}>
          <Image
            src="/icon.png"
            alt="مؤتمر القرن العاشر"
            width={104}
            height={104}
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 900,
          lineHeight: 1.2,
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #ffffff, var(--color-accent-300))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          مؤتمر القرن العاشر
        </h1>

        <p style={{
          fontSize: '1.125rem',
          color: 'rgba(255, 255, 255, 0.6)',
          lineHeight: 1.8,
          marginBottom: '0.5rem',
        }}>
          سجّل حضورك الآن واحصل على تذكرتك الإلكترونية
        </p>

        <p style={{
          fontSize: '0.875rem',
          color: 'rgba(255, 255, 255, 0.35)',
          marginBottom: '3rem',
        }}>
          احرص على رفع صورة إيصال الدفع البنكي لإتمام التسجيل
        </p>

        {/* Primary Action Card */}
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '2.5rem' }}>
          <button
            onClick={() => setShowInstructionsModal(true)}
            className="btn btn-primary btn-lg btn-full"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              fontSize: '1.25rem',
              cursor: 'pointer',
            }}
          >
            <span>تسجيل حضور جديد</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>

          <Link
            href="/ticket/lookup"
            className="btn btn-ghost btn-lg btn-full"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>عرض تذكرتي / متابعة حالة الطلب</span>
          </Link>
        </div>
      </div>
    </main>

      <PaymentInstructionsModal
        isOpen={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
        onProceed={() => {
          router.push('/register');
        }}
      />
    </>
  );
}
