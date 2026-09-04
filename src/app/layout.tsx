import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/context";
import { isFirebaseConfigured } from "@/lib/firebase/client";

export const metadata: Metadata = {
  metadataBase: new URL('https://pope-shenouda-center.vercel.app'),
  title: "دراسة التاريخ الكنسي | مركز البابا شنودة",
  description:
    "نظام تسجيل الحضور لدراسة مركز البابا شنودة للتاريخ الكنسي",
  applicationName: "مركز البابا شنودة للتاريخ الكنسي",
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'مركز شنودة',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: "https://pope-shenouda-center.vercel.app",
    siteName: "مركز البابا شنودة للتاريخ الكنسي",
    title: "دراسة التاريخ الكنسي | مركز البابا شنودة",
    description:
      "نظام تسجيل دراسة مركز البابا شنودة للتاريخ الكنسي",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

function ConfigWarning() {
  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      position: 'relative',
      zIndex: 1,
    }}>
      <div className="glass-card" style={{
        padding: '2.5rem 2rem',
        maxWidth: '32rem',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 style={{ fontSize: '1.625rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--color-accent-400)' }}>
          إعدادات مشروعك غير مكتملة
        </h1>
        <h2 style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem', fontFamily: 'sans-serif' }}>
          Firebase & App Configuration Required
        </h2>
        
        <p style={{
          fontSize: '0.9375rem',
          color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.8,
          marginBottom: '1.5rem',
        }}>
          يرجى نسخ ملف <code>.env.example</code> إلى ملف جديد باسم <code>.env</code> في المجلد الرئيسي للمشروع (<code>event-booking/</code>) ثم ملء بيانات مشروع Firebase والمفاتيح الأخرى لتشغيل النظام.
        </p>

        <div style={{
          padding: '1rem 1.25rem',
          background: 'rgba(19, 12, 5, 0.7)',
          border: '1px solid rgba(242, 158, 19, 0.15)',
          borderRadius: '0.75rem',
          textAlign: 'left',
          direction: 'ltr',
          fontSize: '0.875rem',
          fontFamily: 'monospace',
          color: '#e5c185',
        }}>
          # خطوة 1: انسخ ملف الإعدادات<br/>
          cp .env.example .env
        </div>
      </div>
    </main>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {/* Animated background orbs */}
        <div className="bg-orb bg-orb-1" aria-hidden="true" />
        <div className="bg-orb bg-orb-2" aria-hidden="true" />
        <div className="bg-orb bg-orb-3" aria-hidden="true" />

        {isFirebaseConfigured ? (
          <AuthProvider>{children}</AuthProvider>
        ) : (
          <ConfigWarning />
        )}
      </body>
    </html>
  );
}
