/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Environment variables that will be available at build time
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001',
  },
  // Image optimization for external sources
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

module.exports = nextConfig
