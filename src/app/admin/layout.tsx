'use client';

import { useAuth } from '@/lib/auth/context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

function ReviewBadge({ count, isMobile = false }: { count: number; isMobile?: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : count;

  if (isMobile) {
    return (
      <span
        title={`${count} طلبات في انتظار المراجعة`}
        style={{
          position: 'absolute',
          top: '0.15rem',
          right: 'calc(50% - 1.25rem)',
          minWidth: '1rem',
          height: '1rem',
          padding: '0 0.2rem',
          borderRadius: '9999px',
          backgroundColor: '#ef4444',
          color: '#ffffff',
          fontSize: '0.625rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      title={`${count} طلبات في انتظار المراجعة`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '1.125rem',
        height: '1.125rem',
        padding: '0 0.3rem',
        borderRadius: '9999px',
        backgroundColor: '#ef4444',
        color: '#ffffff',
        fontSize: '0.6875rem',
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
        marginRight: '0.2rem',
      }}
    >
      {label}
    </span>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'الإحصائيات',
    icon: (active) => (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/admin/review',
    label: 'المراجعة',
    icon: (active) => (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: '/admin/registrants',
    label: 'المسجّلين',
    icon: (active) => (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/scanned',
    label: 'تسجيل الحضور',
    icon: (active) => (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/admin/admins',
    label: 'الأدمن',
    icon: (active) => (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!loading) {
      if (pathname === '/admin/login' && user && role === 'admin') {
        router.push('/admin');
      } else if (pathname !== '/admin/login' && (!user || role !== 'admin')) {
        router.push('/admin/login');
      }
    }
  }, [user, role, loading, router, pathname]);

  useEffect(() => {
    if (!user || role !== 'admin') {
      setPendingCount(0);
      return;
    }

    let cancelled = false;
    const currentUser = user;

    async function loadPendingCount() {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { pending?: number; review?: number };
        if (!cancelled) {
          setPendingCount((payload.pending ?? 0) + (payload.review ?? 0));
        }
      } catch (err) {
        console.error('Error loading pending review count:', err);
      }
    }

    void loadPendingCount();
    const interval = setInterval(() => {
      void loadPendingCount();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, role]);

  // Don't apply admin wrapper or auth check to /admin/login page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', padding: '1.5rem', background: '#0a0602' }}>
        <div className="skeleton" style={{ height: '3.75rem', width: '100%', borderRadius: '0.875rem', marginBottom: '2.5rem' }} />
        <div className="skeleton" style={{ height: '2rem', width: '15rem', marginBottom: '1rem' }} />
        <div className="skeleton" style={{ height: '1rem', width: '10rem', marginBottom: '2.5rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1.25rem' }}>
          <div className="skeleton skeleton-card" style={{ height: '8rem', borderRadius: '1rem' }} />
          <div className="skeleton skeleton-card" style={{ height: '8rem', borderRadius: '1rem' }} />
          <div className="skeleton skeleton-card" style={{ height: '8rem', borderRadius: '1rem' }} />
        </div>
      </div>
    );
  }

  if (!user || role !== 'admin') {
    return null;
  }

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh' }}>
      {/* Top Header Bar */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(19, 12, 5, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(242, 158, 19, 0.2)',
        boxShadow: '0 4px 25px rgba(0, 0, 0, 0.5)',
        padding: '0 0.875rem',
      }}>
        <div style={{
          maxWidth: '82rem',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '3.75rem',
          gap: '0.5rem',
        }}>
          {/* Logo / Brand */}
          <Link href="/admin" style={{ textDecoration: 'none', color: '#f7f0e4', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <div style={{
              width: '2.125rem',
              height: '2.125rem',
              borderRadius: '0.5rem',
              background: 'linear-gradient(135deg, rgba(242, 158, 19, 0.3), rgba(179, 130, 63, 0.15))',
              border: '1px solid rgba(242, 158, 19, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f7f0e4', whiteSpace: 'nowrap' }}>
              لوحة التحكم
            </span>
          </Link>

          {/* Desktop Navigation Tabs (Hidden on mobile) */}
          <div className="desktop-nav-tabs" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{
              display: 'flex',
              gap: '0.25rem',
              background: 'rgba(12, 7, 3, 0.6)',
              padding: '0.25rem',
              borderRadius: '0.75rem',
              border: '1px solid rgba(242, 158, 19, 0.15)',
            }}>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      position: 'relative',
                      textDecoration: 'none',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#fbba33' : 'rgba(247, 240, 228, 0.65)',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(242, 158, 19, 0.22), rgba(179, 130, 63, 0.12))'
                        : 'transparent',
                      border: isActive ? '1px solid rgba(242, 158, 19, 0.35)' : '1px solid transparent',
                      boxShadow: isActive ? '0 2px 10px rgba(0, 0, 0, 0.3)' : 'none',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.icon(isActive)}
                    <span>{item.label}</span>
                    {item.href === '/admin/review' && <ReviewBadge count={pendingCount} />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right Action Bar (Mobile & Desktop) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* Passcode Badge - Compact single line */}
            <Link
              href="/scan"
              style={{ textDecoration: 'none' }}
              title="رابط كود دخول خادمي القاعة لماسح التذاكر"
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'rgba(242, 158, 19, 0.14)',
                border: '1px solid rgba(242, 158, 19, 0.35)',
                padding: '0.35rem 0.625rem',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                color: '#fbba33',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                lineHeight: 1,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                <span className="desktop-only-text" style={{ fontSize: '0.75rem' }}>ماسح التذاكر</span>
              </div>
            </Link>

            {/* Sign Out Button */}
            <button
              onClick={() => signOut()}
              title="تسجيل الخروج"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                padding: '0.375rem 0.625rem',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                lineHeight: 1,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hidden-mobile">خروج</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="admin-container page-enter" style={{ paddingTop: '1.5rem', paddingBottom: '5.5rem' }}>
        {children}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Visible on screens < 640px) */}
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(19, 12, 5, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(242, 158, 19, 0.25)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
        padding: '0.375rem 0.25rem calc(0.375rem + env(safe-area-inset-bottom))',
        display: 'none',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  position: 'relative',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.35rem 0.25rem',
                  borderRadius: '0.5rem',
                  flex: 1,
                  textAlign: 'center',
                  background: isActive ? 'rgba(242, 158, 19, 0.15)' : 'transparent',
                  color: isActive ? '#fbba33' : 'rgba(247, 240, 228, 0.6)',
                  transition: 'all 0.2s ease',
                }}
              >
                {item.icon(isActive)}
                <span style={{ fontSize: '0.625rem', fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {item.href === '/admin/review' && <ReviewBadge count={pendingCount} isMobile />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
