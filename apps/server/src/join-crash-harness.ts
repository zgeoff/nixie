import { setFaultPointHandler } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { startHarnessLink } from '@heynixie/testing';

export function joinCrashHarness(): HarnessLink | null {
  // The crash harness spawns nixie with an IPC channel, and a nixie started any other way has none.
  if (process.send === undefined) {
    return null;
  }

  const link = startHarnessLink();

  setFaultPointHandler((id, work) => link.waitAtFaultPoint(id, work));

  return link;
}
