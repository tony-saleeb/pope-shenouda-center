import type { Metadata, Viewport } from 'next';
import AdminShell from './admin-shell';

export const metadata: Metadata = {
  title: 'لوحة التحكم | مركز البابا شنودة',
  applicationName: 'لوحة التحكم',
  manifest: '/admin/pwa-manifest',
  appleWebApp: {
    capable: true,
    title: 'لوحة التحكم',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1208',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
