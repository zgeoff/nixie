import { onTestFinished } from 'bun:test';
import { setFaultPointHandler } from '../lease/set-fault-point-handler';
import type { FaultPointID } from '../types';

// Fails the nth arrival at the fault point, the first by default.
export function startFaultPointFailure(
  id: FaultPointID,
  contextID?: string,
  failingArrival = 1,
): void {
  const arrivals = { count: 0 };

  setFaultPointHandler((arrived, context) => {
    if (arrived !== id || (contextID !== undefined && context.id !== contextID)) {
      return;
    }

    arrivals.count += 1;

    if (arrivals.count === failingArrival) {
      throw new Error(`crashed at ${id}`);
    }
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });
}
