import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user) {
          throw new Error('No account found with this email')
        }

        // Check if user registered with OAuth (no password)
        if (!user.password) {
          throw new Error('This account uses Google sign-in. Please sign in with Google.')
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password)

        if (!isPasswordValid) {
          throw new Error('Invalid password')
        }

        // Return user object (will be available in jwt callback)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Handle Google sign-in - create or update user in database
      if (account?.provider === 'google') {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email }
          })

          if (existingUser) {
            // Update existing user with Google info if they signed up with credentials first
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
          console.error('Error in signIn callback:', error)
          return false
        }
      }
      return true
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub || token.id
        
        // Fetch additional user data from database
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
          console.error('Error fetching user in session:', error)
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
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
