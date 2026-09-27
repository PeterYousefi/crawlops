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

// Prisma connectivity/availability error codes (transient, retryable):
//  P1000 auth failed · P1001 can't reach DB · P1002 timeout ·
//  P1008 operation timed out · P1017 server closed the connection
//  P2024 timed out fetching a connection from the pool (contended/cold pool) ·
//  P2028 transaction API error (transient)
const DB_CONNECTIVITY_CODES = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
]);

// Prisma error class names that indicate an infrastructure/connection problem
// rather than a bug in our query. These are matched by `.name` because we avoid
// importing @prisma/client runtime types here.
const DB_ERROR_CLASS_NAMES = new Set([
  'PrismaClientInitializationError',
  'PrismaClientRustPanicError',
  'PrismaClientUnknownRequestError',
]);

export function isDbConnectivityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; code?: string; message?: string };

  if (e.name && DB_ERROR_CLASS_NAMES.has(e.name)) return true;
  if (typeof e.code === 'string' && DB_CONNECTIVITY_CODES.has(e.code)) return true;

  const msg = (e.message ?? '').toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes('connection pool') ||
    msg.includes('timed out fetching a connection') || // P2024 pool timeout
    msg.includes('connection timed out') ||
    msg.includes('server has closed the connection') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  );
}

/** Safe 503 body for DB connectivity problems (no internal details). */
export const DB_UNAVAILABLE_RESPONSE = {
  error: {
    code: 'DB_UNAVAILABLE',
    message: 'The database is temporarily unavailable. Please retry in a moment.',
  },
} as const;
