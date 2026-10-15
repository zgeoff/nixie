import { hostContract } from '@heynixie/contract';
import { ORPCError, implement } from '@orpc/server';
import { toHostError } from './to-host-error';

// The host contract's implementer. Only nixie's user reaches the control socket, so every error
// keeps its reason: an oRPC error, such as a failed input check, passes through, a memory store
// error keeps its code, and any other error answers 500.
export const hostImplementer = implement(hostContract).use(async (options) => {
  try {
    return await options.next();
  } catch (error) {
    if (error instanceof ORPCError) {
      throw error;
    }

    throw toHostError(error, options.errors);
  }
});
