import type { NextConfig } from "next";

const cspReportOnlyHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.firebaseio.com https://*.google.com https://*.gstatic.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google.com https://*.gstatic.com https://*.upstash.io wss://*.firebaseio.com",
  "frame-src 'self' https://www.google.com https://www.gstatic.com",
].join('; ');

const nextConfig: NextConfig = {
  // Fix ESM/CJS compatibility for firebase-admin and its dependencies on Vercel
  serverExternalPackages: [
    "firebase-admin",
  ],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(self), microphone=(), geolocation=(), payment=()',
        },
        {
          key: 'Content-Security-Policy-Report-Only',
          value: cspReportOnlyHeader,
        },
      ],
    },
  ],
};

export default nextConfig;
