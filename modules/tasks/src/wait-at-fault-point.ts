import { faultPointSlot } from './fault-point-slot';
import type { FaultPointContext, FaultPointID } from './types';

// Each caller must wrap the call in `if (NIXIE_TEST_BUILD)`, so the release bundle drops it and
// holds no fault point ID.
export async function waitAtFaultPoint(
  id: FaultPointID,
  context: FaultPointContext,
): Promise<void> {
  const handler = faultPointSlot.handler;

  if (handler !== null) {
    await handler(id, context);
  }
}
