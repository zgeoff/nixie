import { hostContract } from '@heynixie/contract';
import { ORPCError, implement } from '@orpc/server';
import { toHostError } from './to-host-error';

// Only nixie's user reaches the control socket, so every error keeps its reason.
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
