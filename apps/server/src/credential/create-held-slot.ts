import type { HeldWiring } from '@heynixie/credentials';
import invariant from 'tiny-invariant';

// Where the credential store finds its database backend. The server builds the store before the log
// it needs has started, so the connections part binds the backend once the log is up.
export interface HeldSlot {
  readonly bind: (wiring: HeldWiring) => void;
  readonly read: () => HeldWiring;
}

export function createHeldSlot(): HeldSlot {
  const slot: { current: HeldWiring | null } = { current: null };

  return {
    bind: (wiring) => {
      slot.current = wiring;
    },
    read: () => {
      invariant(slot.current, 'the connections part binds the database backend at start');

      return slot.current;
    },
  };
}
