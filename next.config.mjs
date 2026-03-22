/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@supabase/ssr'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
