import { startSweep } from '@heynixie/clock';
import type { Connections } from '@heynixie/connections';
import { createDatabaseHeldBackend, startConnections } from '@heynixie/connections';
import { createCredentialRecorder } from '@heynixie/credentials';
import type { ErasureRegistry } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { ServerParts } from '../types';

const sweepIntervalMs = 60 * 60 * 1000;

// Starts the credential store's database backend over the log and registers the connection's
// erasable. Each start closes the refreshes a crash lost, sweeps the keys no row names, and records
// `unknown` for a forget that began without a revocation outcome.
export async function startConnectionsPart(
  parts: ServerParts,
  erasure: ErasureRegistry,
): Promise<Connections> {
  const log = parts.context.log;
  const definitions = parts.context.definitions;
  const now = () => parts.context.clock.now();

  const wiring = parts.heldSlot.bind(() => {
    const recorder = createCredentialRecorder({ log, definitions });

    return { backend: createDatabaseHeldBackend({ log, definitions, recorder, now }), recorder };
  });

  const backend = wiring.backend;
  const store = parts.credentials.store;
  const connections = startConnections({ log, definitions, store, backend, erasure, now });

  await store.recover();
  await backend.sweepKeys();
  await connections.writeLostRevocations();

  const sweep = startSweep({
    clock: parts.context.clock,
    intervalMs: sweepIntervalMs,
    run: async () => {
      await backend.sweepKeys();
    },
    onError: (error) => {
      parts.log('connections.key_sweep_failed', toErrorFields(error), 'warn');
    },
  });

  await parts.cleanup.defer(() => sweep.stop());

  return connections;
}
