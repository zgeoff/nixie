import { ORPCError } from '@orpc/client';

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'UNAUTHORIZED';
}
