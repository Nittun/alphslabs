import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis

// Only create Prisma client if DATABASE_URL is available
let prisma = null

if (process.env.DATABASE_URL) {
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }
}

export { prisma }
export default prisma

