import { onTestFinished } from 'bun:test';
import type { FaultPointID } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';

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
