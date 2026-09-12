import { loadEnvFile } from 'node:process'
try { loadEnvFile(new URL('../../.env', import.meta.url)) } catch (error) { if (error.code !== 'ENOENT') throw error }

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  devIndicators: false,
  env: { NEXT_PUBLIC_CORE_API_URL: process.env.CORE_API_URL || `http://127.0.0.1:${process.env.CORE_PORT || '8080'}` },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }]
  },
}
export default config
