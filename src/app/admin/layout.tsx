'use client';

import { useAuth } from '@/lib/auth/context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'الإحصائيات',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: '/admin/registrants',
    label: 'المسجّلين',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/import',
    label: 'كشف الحساب',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    href: '/scan',
    label: 'الماسح 📷',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#fbba33' : 'rgba(247,240,228,0.6)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (pathname === '/admin/login' && user && role === 'admin') {
        router.push('/admin');
      } else if (pathname !== '/admin/login' && (!user || role !== 'admin')) {
        router.push('/admin/login');
      }
    }
  }, [user, role, loading, router, pathname]);

  // Don't apply admin wrapper or auth check to /admin/login page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg spinner-gold" />
      </main>
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
        background: 'rgba(19, 12, 5, 0.88)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(242, 158, 19, 0.18)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        padding: '0 1rem',
      }}>
        <div style={{
          maxWidth: '80rem',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '4rem',
        }}>
          {/* Logo / Brand */}
          <Link href="/admin" style={{ textDecoration: 'none', color: '#f7f0e4', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '0.625rem',
              background: 'linear-gradient(135deg, rgba(242, 158, 19, 0.25), rgba(179, 130, 63, 0.15))',
              border: '1px solid rgba(242, 158, 19, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f7f0e4' }}>
              لوحة التحكم
            </span>
          </Link>

          {/* Desktop Navigation Tabs (Hidden on mobile) */}
          <div className="desktop-nav-tabs" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{
              display: 'flex',
              gap: '0.375rem',
              background: 'rgba(12, 7, 3, 0.5)',
              padding: '0.25rem 0.375rem',
              borderRadius: '0.75rem',
              border: '1px solid rgba(242, 158, 19, 0.12)',
            }}>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      textDecoration: 'none',
                      padding: '0.5rem 0.875rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
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
                      gap: '0.5rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.icon(isActive)}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right Action Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Link
              href="/scan"
              style={{ textDecoration: 'none' }}
              title="رابط كود دخول خادمي القاعة لماسح التذاكر"
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: 'rgba(242, 158, 19, 0.12)',
                border: '1px solid rgba(242, 158, 19, 0.3)',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                color: '#fbba33',
                fontWeight: 700,
              }}>
                <span>🔑 كود الماسح:</span>
                <span style={{ fontFamily: 'monospace', letterSpacing: '1px', color: '#fff' }}>102030</span>
              </div>
            </Link>

            {/* Sign Out Button */}
            <button
              onClick={() => signOut()}
              title="تسجيل الخروج"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                padding: '0.45rem 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <main className="admin-container page-enter" style={{ paddingTop: '1.5rem', paddingBottom: '5rem' }}>
        {children}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Visible on screens < 640px) */}
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(19, 12, 5, 0.94)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(242, 158, 19, 0.25)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
        padding: '0.375rem 0.5rem calc(0.375rem + env(safe-area-inset-bottom))',
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
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.375rem 0.5rem',
                  borderRadius: '0.625rem',
                  flex: 1,
                  textAlign: 'center',
                  background: isActive ? 'rgba(242, 158, 19, 0.15)' : 'transparent',
                  color: isActive ? '#fbba33' : 'rgba(247, 240, 228, 0.6)',
                  transition: 'all 0.2s ease',
                }}
              >
                {item.icon(isActive)}
                <span style={{ fontSize: '0.6875rem', fontWeight: isActive ? 700 : 500 }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
