import { ORPCError } from '@orpc/client';

export function formatCallError(error: unknown): string {
  return error instanceof ORPCError ? `${error.status} ${error.message}` : String(error);
}
