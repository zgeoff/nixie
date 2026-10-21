import { faultPointSlot } from './fault-point-slot';
import type { FaultPointHandler } from './types';

export function setFaultPointHandler(handler: FaultPointHandler | null): void {
  if (!NIXIE_TEST_BUILD) {
    throw new Error('fault points exist only in a test build');
  }

  faultPointSlot.handler = handler;
}
