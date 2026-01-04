export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/backtest/:path*',
    '/current-position/:path*',
  ],
}

