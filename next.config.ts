import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fix ESM/CJS compatibility for firebase-admin and its dependencies on Vercel
  // jose v6+ is ESM-only but jwks-rsa tries to require() it
  serverExternalPackages: [
    "firebase-admin",
  ],
};

export default nextConfig;
