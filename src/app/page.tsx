'use client';

import Link from 'next/link';
import Header from '@/components/Header';

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', maxWidth: '32rem', margin: '0 auto' }}>
        {/* Church Icon */}
        <div style={{
          width: '5rem',
          height: '5rem',
          margin: '0 auto 2rem',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(79, 82, 247, 0.35)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 21V9l-6-6-6 6v12" />
            <path d="M12 3v6" />
            <path d="M9 6h6" />
            <path d="M9 21h6" />
            <path d="M9 21v-4a3 3 0 0 1 6 0v4" />
          </svg>
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
          مؤتمر الكنيسة
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
          التسجيل سريع وسهل — ٤ خطوات فقط
        </p>

        {/* CTA Button */}
        <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '100%', width: '100%' }}>
          <Link href="/register" style={{ textDecoration: 'none' }}>
            <button
              className="btn btn-accent btn-lg btn-full"
              style={{ fontSize: '1.375rem', letterSpacing: '0.02em' }}
            >
              <span>سجّل الآن</span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'scaleX(-1)' }}>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </Link>

          <Link href="/ticket/lookup" style={{ textDecoration: 'none' }}>
            <button
              className="btn btn-ghost btn-lg btn-full"
              style={{ fontSize: '1.125rem' }}
            >
              <span>تحقق من تذكرتك / حالة طلبك</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '1rem',
        fontSize: '0.75rem',
        color: 'rgba(255, 255, 255, 0.2)',
      }}>
        نظام تسجيل الحضور الإلكتروني
      </footer>
    </main>
    </>
  );
}
