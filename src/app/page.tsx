'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Header from '@/components/Header';

export default function HomePage() {
  const router = useRouter();

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '32rem', margin: '0 auto' }}>
        <div style={{
          width: '16rem',
          maxWidth: '90%',
          margin: '0 auto 1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Image
            src="/logo-shenouda.png"
            alt="مركز البابا شنودة للتاريخ الكنسي بكنائس وسط القاهرة"
            width={2000}
            height={2000}
            style={{
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 10px 24px rgba(0, 0, 0, 0.55))',
            }}
            priority
          />
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3rem)',
          fontWeight: 900,
          lineHeight: 1.2,
          marginBottom: '1rem',
          color: '#f3e6c8',
          textShadow: '0 2px 18px rgba(0, 0, 0, 0.45)',
        }}>
          دراسة التاريخ الكنسي
        </h1>

        <p style={{
          fontSize: '1.125rem',
          color: 'rgba(243, 230, 200, 0.78)',
          lineHeight: 1.8,
          marginBottom: '0.5rem',
        }}>
          سجّل في الدراسة الآن واحصل على تذكرتك الإلكترونية
        </p>

        <p style={{
          fontSize: '0.875rem',
          color: 'rgba(212, 175, 106, 0.7)',
          marginBottom: '3rem',
        }}>
          احرص على رفع صورة إيصال الدفع البنكي لإتمام التسجيل
        </p>

        <div style={{ display: 'grid', gap: '1rem', marginBottom: '2.5rem' }}>
          <button
            type="button"
            onClick={() => router.push('/register')}
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
            <span>التسجيل في الدراسة</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </main>
    </>
  );
}
