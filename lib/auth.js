import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import prisma from './prisma'
import bcrypt from 'bcryptjs'

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const logLoginFailure = async (reason, userId) => {
          if (!prisma) return
          try {
            await prisma.featureUsage.create({
              data: {
                feature: 'login_failed',
                userId: userId || null,
                metadata: {
                  reason,
                  email: credentials?.email || null
                }
              }
            })
          } catch (error) {
            console.error('Failed to log login failure:', error)
          }
        }

        if (!credentials?.email || !credentials?.password) {
          await logLoginFailure('missing_credentials')
          throw new Error('Email and password are required')
        }

        // Check if database is available
        if (!prisma) {
          console.error('Database not configured')
          await logLoginFailure('db_unavailable')
          throw new Error('Database connection unavailable. Please try again later.')
        }

        try {
          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: credentials.email }
          })

          if (!user) {
            await logLoginFailure('user_not_found')
            throw new Error('No account found with this email')
          }

          // Check if user registered with OAuth (no password)
          if (!user.password) {
            await logLoginFailure('oauth_only', user.id)
            throw new Error('This account uses Google sign-in. Please sign in with Google.')
          }

          // Verify password
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password)

          if (!isPasswordValid) {
            await logLoginFailure('invalid_password', user.id)
            throw new Error('Invalid password')
          }

          // Return user object (will be available in jwt callback)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          }
        } catch (error) {
          console.error('Authorize error:', error)
          throw error
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Always allow sign-in for Google, even if database operations fail
      if (account?.provider === 'google') {
        // If no database, still allow Google sign-in (data stored in JWT)
        if (!prisma) {
          console.warn('Database not available, skipping user sync')
          return true
        }

        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email }
          })

          if (existingUser) {
            // Update existing user with Google info
            await prisma.user.update({
              where: { email: user.email },
              data: {
                name: user.name || existingUser.name,
                image: user.image || existingUser.image,
                authProvider: existingUser.authProvider === 'credentials' ? 'both' : 'google',
              }
            })
          } else {
            // Create new user from Google sign-in
            await prisma.user.create({
              data: {
                email: user.email,
                name: user.name,
                image: user.image,
                authProvider: 'google',
              }
            })
          }
        } catch (error) {
          // Log error but DON'T block sign-in
          console.error('Error syncing user to database (non-blocking):', error)
          // Still return true - user can sign in, data just won't be in DB
        }
      }
      return true
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub || token.id
        
        // Try to fetch additional user data from database
        if (prisma) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email: session.user.email },
              select: { id: true, role: true, authProvider: true }
            })
            if (dbUser) {
              session.user.id = dbUser.id
              session.user.role = dbUser.role
              session.user.authProvider = dbUser.authProvider
            }
          } catch (error) {
            // Non-blocking - session still works without DB data
            console.error('Error fetching user in session (non-blocking):', error)
          }
        }
      }
      return session
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
      }
      if (account) {
        token.provider = account.provider
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  debug: process.env.NODE_ENV === 'development',
}
