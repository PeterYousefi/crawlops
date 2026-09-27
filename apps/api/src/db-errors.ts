/**
 * Database error classification for safe HTTP responses.
 *
 * WHAT: Detects PostgreSQL/Prisma *connectivity* problems (unreachable, auth,
 *       pool timeout — common on a cold scale-to-zero container before the DB
 *       connection is warm) and lets routes return a structured, safe
 *       `DB_UNAVAILABLE` (503) instead of a generic 500.
 * WHY:  Distinguishes "the database wasn't reachable right now" (retryable,
 *       transient) from a real server bug, WITHOUT leaking stack traces,
 *       connection strings, or other internals to the browser.
 * HOW:  `isDbConnectivityError(err)` — true for Prisma init errors and the
 *       known connectivity error codes. Callers map that to a 503 body.
 */

// Prisma connectivity/availability error codes:
//  P1000 auth failed · P1001 can't reach DB · P1002 timeout ·
//  P1008 operation timed out · P1017 server closed the connection
const DB_CONNECTIVITY_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017']);

export function isDbConnectivityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; code?: string; message?: string };

  // Prisma throws PrismaClientInitializationError when it cannot establish a
  // connection (the typical cold-start / DB-not-ready case).
  if (e.name === 'PrismaClientInitializationError') return true;
  if (typeof e.code === 'string' && DB_CONNECTIVITY_CODES.has(e.code)) return true;

  const msg = (e.message ?? '').toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes('connection pool') ||
    msg.includes('connection timed out') ||
    msg.includes('econnrefused')
  );
}

/** Safe 503 body for DB connectivity problems (no internal details). */
export const DB_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'DB_UNAVAILABLE',
    message: 'The database is temporarily unavailable. Please retry in a moment.',
  },
} as const;
