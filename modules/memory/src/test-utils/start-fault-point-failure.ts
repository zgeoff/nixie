import { onTestFinished } from 'bun:test';
import type { FaultPointID } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';

// Makes the first caller that reaches the fault point throw, as a crash at that point would stop
// it, and lets every later arrival and every other fault point through, so a restarted store
// passes the same point. When the test finishes it removes the handler.
export function startFaultPointFailure(id: FaultPointID): void {
  const arrivals = { count: 0 };

  setFaultPointHandler((arrived) => {
    if (arrived !== id) {
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
