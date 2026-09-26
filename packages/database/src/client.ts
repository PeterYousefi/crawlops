/**
 * Prisma client singleton.
 *
 * WHAT: A single shared PrismaClient instance.
 * WHY:  Avoids exhausting the connection pool by creating clients per request,
 *       especially with hot-reload in development.
 * HOW:  Import `prisma` anywhere. Requires DATABASE_URL to be set at use time.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
