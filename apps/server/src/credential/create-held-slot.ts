import type { DatabaseHeldBackend } from '@heynixie/connections';
import type { HeldWiring } from '@heynixie/credentials';
import invariant from 'tiny-invariant';

interface DatabaseHeldWiring extends HeldWiring {
  readonly backend: DatabaseHeldBackend;
}

// Where the credential store finds its database backend. The server builds the store before the log
// it needs has started, so the connections part binds the backend once the log is up.
export interface HeldSlot<Wiring extends HeldWiring = DatabaseHeldWiring> {
  // Binds what `create` makes, unless a start already bound one, and returns the bound wiring. The
  // store keeps the first backend it reads, so a start that runs again must reach that backend.
  readonly bind: (create: () => Wiring) => Wiring;
  readonly read: () => HeldWiring;
}

export function createHeldSlot<Wiring extends HeldWiring = DatabaseHeldWiring>(): HeldSlot<Wiring> {
  const slot: { current: Wiring | null } = { current: null };

  return {
    bind: (create) => {
      slot.current ??= create();

      return slot.current;
    },
    read: () => {
      invariant(slot.current, 'the connections part binds the database backend at start');

      return slot.current;
    },
  };
}
