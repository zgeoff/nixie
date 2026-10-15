import { onTestFinished } from 'bun:test';
import type { FaultPointContext, FaultPointID } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';

export interface FaultPointHold {
  // settles with the context of the first arrival at the held fault point
  readonly reached: Promise<FaultPointContext>;

  // lets the held caller continue
  readonly release: () => void;
}

// Holds the first caller that reaches the fault point until the test releases it, and lets every
// later arrival and every other fault point through, so a restarted store passes the same point.
// When the test finishes it releases the caller and removes the handler.
export function startFaultPointHold(id: FaultPointID): FaultPointHold {
  const reached = Promise.withResolvers<FaultPointContext>();
  const gate = Promise.withResolvers<void>();
  const arrivals = { count: 0 };

  setFaultPointHandler(async (arrived, context) => {
    if (arrived !== id) {
      return;
    }

    arrivals.count += 1;

    if (arrivals.count === 1) {
      reached.resolve(context);

      await gate.promise;
    }
  });

  onTestFinished(() => {
    gate.resolve();

    setFaultPointHandler(null);
  });

  return {
    reached: reached.promise,
    release: () => {
      gate.resolve();
    },
  };
}
