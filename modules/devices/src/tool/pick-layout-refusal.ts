import type { ParsedLayout } from '../layout/parse-layout';
import type { Device } from '../types';

export interface LayoutRefusal {
  readonly code: 'UNKNOWN_DEVICE' | 'SCREEN_OFF' | 'BAD_LAYOUT' | 'OFFLINE';

  // a sentence that replaces the code's own
  readonly detail?: string;
}

interface LayoutFacts {
  readonly device: Device | null;

  // the grid the call set, or null for a call that clears the layout
  readonly parsed: ParsedLayout | null;
  readonly isOnline: boolean;
}

// The first refusal of a layout call, in the order the design fixes: the device, its screen, the
// grid, then whether the device is online.
export function pickLayoutRefusal(facts: LayoutFacts): LayoutRefusal | null {
  if (facts.device === null) {
    return { code: 'UNKNOWN_DEVICE' };
  }

  if (!facts.device.capabilities.screen) {
    return { code: 'SCREEN_OFF' };
  }

  if (facts.parsed?.status === 'bad') {
    return { code: 'BAD_LAYOUT', detail: facts.parsed.reason };
  }

  return facts.isOnline ? null : { code: 'OFFLINE' };
}
