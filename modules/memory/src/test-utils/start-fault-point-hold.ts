import { onTestFinished } from 'bun:test';
import type { FaultPointContext, FaultPointID } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';

export interface FaultPointHold {
  readonly reached: Promise<FaultPointContext>;

  readonly release: () => void;
}

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
