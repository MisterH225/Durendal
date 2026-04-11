/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permet au middleware Edge de lire AUTH_UI_BYPASS au build (mode prévisualisation)
  env: {
    AUTH_UI_BYPASS: process.env.AUTH_UI_BYPASS ?? '',
  },
  experimental: {
    serverComponentsExternalPackages: ['@supabase/ssr'],
    staleTimes: {
      dynamic: 0,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
