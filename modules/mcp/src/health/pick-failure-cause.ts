import { SdkHttpError, UnauthorizedError } from '@modelcontextprotocol/client';
import type { ListingFailureCause } from './types';

// Sorts what a failed server listing threw into the 5 causes that a record and an error to the
// model name. A cause the proxy cannot tell apart is `error`.
export function pickFailureCause(error: unknown): ListingFailureCause {
  if (error instanceof UnauthorizedError) {
    return 'unauthorised';
  }

  if (error instanceof SdkHttpError && (error.status === 401 || error.status === 403)) {
    return 'unauthorised';
  }

  if (!(error instanceof Error)) {
    return 'error';
  }

  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return 'timeout';
  }

  const text = `${error.name} ${error.message}`.toLowerCase();

  if (text.includes('timed out') || text.includes('timeout')) {
    return 'timeout';
  }

  if (/econnrefused|unable to connect|fetch failed|enotfound|connection refused/u.test(text)) {
    return 'refused';
  }

  if (
    /zod|validation|unexpected token|invalid (?:json|input|type|result)|not valid json|parse/u.test(
      text,
    )
  ) {
    return 'unparsable';
  }

  return 'error';
}
