import { startSweep } from '@heynixie/clock';
import type { Connections, DatabaseHeldBackend } from '@heynixie/connections';
import { probeConnectionEnabled, startConnections } from '@heynixie/connections';
import { createGoogleProvider } from '@heynixie/connector-google';
import { buildGmailMailbox, buildGoogleConnector } from '@heynixie/google';
import type { ErasureRegistry } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import { eraseConnectionMailbox, readConnectionWakeRecords } from '@heynixie/triggers';
import type { ServerParts } from '../types';
import type { GoogleToolsPart } from './start-google-tools-part';

const sweepIntervalMs = 60 * 60 * 1000;
const checkIntervalMs = 24 * 60 * 60 * 1000;
const defaultBreakNoticeMs = 2 * 24 * 60 * 60 * 1000;

// Registers the connection's erasable on the runner and starts the Google connections on the
// credential store's backend. Each start sweeps lapsed consents, and records `unknown` for a forget
// with no revocation outcome. A daily pass checks each connection's scopes.
export async function startConnectionsPart(
  parts: ServerParts,
  erasure: ErasureRegistry,
  google: GoogleToolsPart,
  backend: DatabaseHeldBackend,
): Promise<Connections> {
  const log = parts.context.log;
  const definitions = parts.context.definitions;
  const now = () => parts.context.clock.now();
  const store = parts.credentials.store;

  const connections = startConnections({
    log,
    definitions,
    store,
    backend,
    erasure,
    now,
    breakNoticeMs: parts.config.google?.break_notice ?? defaultBreakNoticeMs,
    connector: buildGoogleConnector(createGoogleProvider(google.hosts), [...google.actions]),
    eraseDependents: (connectionID) =>
      eraseConnectionMailbox(
        { log, clock: parts.context.clock, definitions },
        buildGmailMailbox(connectionID),
      ),
    readWakes: async (tx, connectionID) => {
      const wakes = await readConnectionWakeRecords(tx, buildGmailMailbox(connectionID));

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

  await connections.writeLostRevocations();
  await connections.sweepConsents();

  const sweep = startSweep({
    clock: parts.context.clock,
    intervalMs: sweepIntervalMs,
    run: async () => {
      await connections.sweepConsents();
    },
    onError: (error) => {
      parts.log('connections.consent_sweep_failed', toErrorFields(error), 'warn');
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

  const watch = startSweep({
    clock: parts.context.clock,
    intervalMs: sweepIntervalMs,
    run: async () => {
      await connections.runStatusWatch();
    },
    onError: (error) => {
      parts.log('connections.status_watch_failed', toErrorFields(error), 'warn');
    },
  });

  await parts.cleanup.defer(() => watch.stop());
  await parts.cleanup.defer(() => sweep.stop());
  await parts.cleanup.defer(() => check.stop());

  return connections;
}
