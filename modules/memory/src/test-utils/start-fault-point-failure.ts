import { onTestFinished } from 'bun:test';
import type { FaultPointID } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';

export function startFaultPointFailure(id: FaultPointID, contextID?: string): void {
  const arrivals = { count: 0 };

  setFaultPointHandler((arrived, context) => {
    if (arrived !== id || (contextID !== undefined && context.id !== contextID)) {
      return;
    }

    arrivals.count += 1;

    if (arrivals.count === 1) {
      throw new Error(`crashed at ${id}`);
    }
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });
}
