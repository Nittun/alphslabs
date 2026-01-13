import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow all requests to auth-related paths
        if (req.nextUrl.pathname.startsWith('/api/auth')) {
          return true
        }
        // Require token for protected paths
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    '/backtest/:path*',
    '/current-position/:path*',
    '/optimize/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/connections/:path*',
    '/help/:path*',
    '/admin/:path*',
  ],
}
