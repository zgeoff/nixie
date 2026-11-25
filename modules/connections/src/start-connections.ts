import type { CredentialStore } from '@heynixie/credentials';
import type { Definitions, ErasureHandle, ErasureRegistry, Log } from '@heynixie/log';
import type { DatabaseHeldBackend } from './backend/create-database-held-backend';
import { buildConnectionErasable } from './erasure/build-connection-erasable';
import { connectionErasableDescriptor } from './erasure/connection-erasable-descriptor';
import type { ConnectionErasureRequest } from './erasure/start-connection-erasure';
import type { ProviderEndpoints } from './provider/google-endpoints';
import { googleEndpoints } from './provider/google-endpoints';
import { writeLostRevocations } from './revocation/write-lost-revocations';

export interface ConnectionsOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly store: CredentialStore;
  readonly backend: DatabaseHeldBackend;
  readonly erasure: ErasureRegistry;
  readonly now: () => number;

  // Google's endpoints; a test points them at a fake provider
  readonly endpoints?: ProviderEndpoints;
}

export interface Connections {
  // begins a forget and runs it to its end
  readonly forget: ErasureHandle<ConnectionErasureRequest>;

  // At start, before the runner's catch-up: gives each forget with no revocation outcome the outcome
  // `unknown`, so the catch-up never sends a second revocation.
  readonly writeLostRevocations: () => Promise<number>;
}

// Registers the connection's erasable with the runner, and returns what the server runs at start.
export function startConnections(options: ConnectionsOptions): Connections {
  const writer = { log: options.log, definitions: options.definitions };

  const forget = options.erasure.register({
    ...connectionErasableDescriptor,
    ...buildConnectionErasable({
      ...writer,
      store: options.store,
      backend: options.backend,
      endpoints: options.endpoints ?? googleEndpoints,
      attempted: new Set(),
      now: options.now,
    }),
  });

  return { forget, writeLostRevocations: () => writeLostRevocations(writer) };
}
