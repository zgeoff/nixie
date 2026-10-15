import { onTestFinished } from 'bun:test';
import type { FaultPointID } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';

// Runs the action while the first caller to reach the fault point waits there, then lets it go on.
// Every later arrival and every other fault point passes, and the handler goes when the test ends.
export function registerFaultPointAction(id: FaultPointID, action: () => Promise<unknown>): void {
  const arrivals = { count: 0 };

  setFaultPointHandler(async (arrived) => {
    if (arrived !== id) {
      return;
    }

    arrivals.count += 1;

    if (arrivals.count === 1) {
      await action();
    }
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });
}
