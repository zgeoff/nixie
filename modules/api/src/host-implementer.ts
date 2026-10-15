import { hostContract } from '@heynixie/contract';
import { implement } from '@orpc/server';
import { toHostError } from './to-host-error';

// The host contract's implementer, which each host procedure group builds its handlers from. Every
// procedure answers an error with its own reason, since only nixie's user reaches the control
// socket: a memory store error keeps its code, and any other error answers 500.
export const hostImplementer = implement(hostContract).use(async (options) => {
  try {
    return await options.next();
  } catch (error) {
    throw toHostError(error, options.errors);
  }
});
