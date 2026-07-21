import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/context";
import { isFirebaseConfigured } from "@/lib/firebase/client";

export const metadata: Metadata = {
  title: "تسجيل الحضور | مؤتمر الكنيسة",
  description:
    "نظام تسجيل الحضور وحجز التذاكر لمؤتمر الكنيسة — سجّل الآن واحصل على تذكرتك الإلكترونية",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f0d3d",
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
        <p style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⚠️</p>
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
