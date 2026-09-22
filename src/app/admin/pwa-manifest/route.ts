import { NextResponse } from 'next/server';

const adminManifest = {
  id: '/admin',
  name: 'لوحة التحكم — مركز البابا شنودة',
  short_name: 'لوحة التحكم',
  description: 'إدارة تسجيلات دراسة التاريخ الكنسي',
  start_url: '/admin',
  scope: '/admin',
  display: 'standalone',
  background_color: '#1a1208',
  theme_color: '#1a1208',
  lang: 'ar',
  dir: 'rtl',
  icons: [
    {
      src: '/icon.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
  ],
};

export function GET() {
  return new NextResponse(JSON.stringify(adminManifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
