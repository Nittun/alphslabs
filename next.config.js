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
    // Optimize image loading
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  
  // Enable compression
  compress: true,
  
  // Optimize production builds
  swcMinify: true,
  
  // Optimize fonts
  optimizeFonts: true,
  
  // Headers for caching static assets
  async headers() {
    return [
      {
        // Cache static assets for 1 year
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache JS and CSS for 1 year (they have hashed names)
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache API responses that don't change often
        source: '/api/default-config',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ]
  },
  
  // Experimental features for better performance
  experimental: {
    // Optimize package imports
    optimizePackageImports: ['lightweight-charts', 'sweetalert2', 'framer-motion'],
  },
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Production optimizations
    if (!dev && !isServer) {
      // Split chunks more aggressively
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        cacheGroups: {
          // Vendor chunk for node_modules
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
          // Separate chunk for chart libraries
          charts: {
            test: /[\\/]node_modules[\\/](lightweight-charts|apexcharts|react-apexcharts)[\\/]/,
            name: 'charts',
            chunks: 'all',
            priority: 20,
          },
          // Common components chunk
          common: {
            minChunks: 2,
            priority: -10,
            reuseExistingChunk: true,
          },
        },
      }
    }
    
    return config
  },
}

module.exports = nextConfig
