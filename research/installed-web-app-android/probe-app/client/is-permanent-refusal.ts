import { ORPCError } from '@orpc/client';

// A 4xx answer stays the same on a retry, except a timeout or a rate limit. A network failure or a
// 5xx answer can pass on the next try.
export function isPermanentRefusal(error: unknown): error is ORPCError<string, unknown> {
  return (
    error instanceof ORPCError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}
