import { faultPointSlot } from './fault-point-slot';
import type { FaultPointContext, FaultPointID } from './types';

// Holds the caller at a named transition while the installed handler decides: the harness reports
// the arrival, then kills the process or releases the runner. With no handler it returns at once.
// Every call sits inside `if (NIXIE_TEST_BUILD)`, so the release bundle holds no fault point ID.
export async function waitAtFaultPoint(
  id: FaultPointID,
  context: FaultPointContext,
): Promise<void> {
  const handler = faultPointSlot.handler;

  if (handler !== null) {
    await handler(id, context);
  }
}
