import type { CallCapCheck, PaidCallCap } from '../types';

export interface CountingCallCap {
  readonly callCap: PaidCallCap;

  // the calls counted so far
  readonly counted: () => number;
}

// A call cap that holds limit calls, and refuses with a fixed message past them.
export function buildCountingCallCap(limit: number): CountingCallCap {
  const state = { count: 0 };

  return {
    counted: () => state.count,
    callCap: {
      openCall: () => ({
        checkInTransaction: () => {
          const check: CallCapCheck =
            state.count < limit
              ? { status: 'room' }
              : { status: 'capped', message: 'the cap is reached' };

          return Promise.resolve(check);
        },
        countInTransaction: () => {
          state.count += 1;

          return Promise.resolve();
        },
      }),
    },
  };
}
