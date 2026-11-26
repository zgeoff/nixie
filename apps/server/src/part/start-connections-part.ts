import { startSweep } from '@heynixie/clock';
import type { Connections } from '@heynixie/connections';
import {
  createDatabaseHeldBackend,
  probeConnectionEnabled,
  startConnections,
} from '@heynixie/connections';
import { createGoogleConnector } from '@heynixie/connectors';
import { createCredentialRecorder } from '@heynixie/credentials';
import type { ErasureRegistry } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import { eraseGmailMailbox, readGmailWakeRecords } from '@heynixie/triggers';
import type { ServerParts } from '../types';
import type { GoogleToolsPart } from './start-google-tools-part';

const sweepIntervalMs = 60 * 60 * 1000;
const checkIntervalMs = 24 * 60 * 60 * 1000;

// Starts the credential store's database backend and registers the connection's erasable. Each start
// closes the refreshes a crash lost, sweeps keys and lapsed consents, and records `unknown` for a
// forget with no revocation outcome. A daily pass checks each connection's scopes.
export async function startConnectionsPart(
  parts: ServerParts,
  erasure: ErasureRegistry,
  google: GoogleToolsPart,
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

  const connections = startConnections({
    log,
    definitions,
    store,
    backend,
    erasure,
    now,
    connector: createGoogleConnector(google.hosts, [...google.actions]),
    eraseDependents: (connectionID) =>
      eraseGmailMailbox({ log, clock: parts.context.clock, definitions }, connectionID),
    readWakes: async (tx, connectionID) => {
      const wakes = await readGmailWakeRecords(tx, connectionID);

      return wakes.map((wake) => ({ sequence: wake.sequence, thread: wake.thread }));
    },
  });

  google.bindRuntime({
    readLiveContexts: (connection) => connections.readLiveContexts(connection),
    readStates: () => connections.readStates(),
    probeLive: probeConnectionEnabled,
    log,
    clock: parts.context.clock,
    definitions,
  });

  await store.recover();
  await backend.sweepKeys();
  await connections.writeLostRevocations();
  await connections.sweepConsents();

  const sweep = startSweep({
    clock: parts.context.clock,
    intervalMs: sweepIntervalMs,
    run: async () => {
      await backend.sweepKeys();
      await connections.sweepConsents();
    },
    onError: (error) => {
      parts.log('connections.key_sweep_failed', toErrorFields(error), 'warn');
    },
  });

  const check = startSweep({
    clock: parts.context.clock,
    intervalMs: checkIntervalMs,
    run: async () => {
      await connections.runDailyChecks();
    },
    onError: (error) => {
      parts.log('connections.daily_check_failed', toErrorFields(error), 'warn');
    },
  });

  await parts.cleanup.defer(() => sweep.stop());
  await parts.cleanup.defer(() => check.stop());

  return connections;
}
