import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'مركز البابا شنودة للتاريخ الكنسي',
    short_name: 'مركز شنودة',
    description: 'نظام تسجيل دراسة التاريخ الكنسي — مركز البابا شنودة',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
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
}
