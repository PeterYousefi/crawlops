import { describe, it, expect } from 'vitest';
import { isDbConnectivityError } from './db-errors.js';

describe('isDbConnectivityError', () => {
  it('matches Prisma init errors', () => {
    expect(isDbConnectivityError({ name: 'PrismaClientInitializationError' })).toBe(true);
  });

  it('matches connection-pool timeout P2024 (the run-start 500 gap)', () => {
    expect(
      isDbConnectivityError({
        name: 'PrismaClientKnownRequestError',
        code: 'P2024',
        message: 'Timed out fetching a connection from the pool.',
      }),
    ).toBe(true);
  });

  it('matches "server has closed the connection" (P1017-style)', () => {
    expect(isDbConnectivityError({ code: 'P1017', message: 'Server has closed the connection.' })).toBe(true);
  });

  it('matches rust panic / unknown request (infra) errors', () => {
    expect(isDbConnectivityError({ name: 'PrismaClientRustPanicError' })).toBe(true);
    expect(isDbConnectivityError({ name: 'PrismaClientUnknownRequestError' })).toBe(true);
  });

  it('matches ECONNRESET/ECONNREFUSED messages', () => {
    expect(isDbConnectivityError(new Error('read ECONNRESET'))).toBe(true);
    expect(isDbConnectivityError(new Error('connect ECONNREFUSED 10.0.0.5:5432'))).toBe(true);
  });

  it('does NOT match a real validation/query bug (e.g. P2002 unique constraint)', () => {
    expect(
      isDbConnectivityError({
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        message: 'Unique constraint failed',
      }),
    ).toBe(false);
  });

  it('ignores non-error values', () => {
    expect(isDbConnectivityError(null)).toBe(false);
    expect(isDbConnectivityError('boom')).toBe(false);
  });
});
