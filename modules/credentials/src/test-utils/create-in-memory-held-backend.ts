import type { HeldBackend, HeldClient, HeldToken } from '../held/types';

export interface InMemoryHeldBackend extends HeldBackend {
  // the key IDs that exist, so a test sees which keys a refresh left behind
  readonly readKeyIDs: () => readonly string[];
}

// A held backend in memory, for tests. Nothing in a release build uses it.
export function createInMemoryHeldBackend(): InMemoryHeldBackend {
  const clients = new Map<string, HeldClient>();
  const tokens = new Map<string, HeldToken>();
  const counters = new Map<string, number>();
  const keys = new Set<string>();

  const readCounter = (credentialID: string): number => counters.get(credentialID) ?? 0;

  return {
    readRemovalCounter: (credentialID) => Promise.resolve(readCounter(credentialID)),
    readClient: (credentialID) => Promise.resolve(clients.get(credentialID) ?? null),
    writeClient: (credentialID, client) => {
      clients.set(credentialID, client);

      return Promise.resolve();
    },
    readToken: (credentialID) => Promise.resolve(tokens.get(credentialID) ?? null),
    writeToken: (credentialID, token, expectedCounter) => {
      if (readCounter(credentialID) !== expectedCounter) {
        return Promise.resolve('removed');
      }

      tokens.set(credentialID, token);

      return Promise.resolve('saved');
    },
    writeState: (credentialID, state) => {
      const token = tokens.get(credentialID);

      if (token !== undefined) {
        tokens.set(credentialID, { ...token, state });
      }

      return Promise.resolve();
    },
    createKey: () => {
      const keyID = crypto.randomUUID();

      keys.add(keyID);

      return Promise.resolve(keyID);
    },
    removeKey: (keyID) => {
      keys.delete(keyID);

      return Promise.resolve();
    },
    remove: (credentialID) => {
      const token = tokens.get(credentialID);

      if (token !== undefined) {
        keys.delete(token.keyID);
      }

      tokens.delete(credentialID);
      clients.delete(credentialID);
      counters.set(credentialID, readCounter(credentialID) + 1);

      return Promise.resolve(readCounter(credentialID));
    },
    readKeyIDs: () => [...keys],
  };
}
