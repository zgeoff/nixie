import { startSweep } from '@heynixie/clock';
import type { Connections } from '@heynixie/connections';
import { createDatabaseHeldBackend, startConnections } from '@heynixie/connections';
import { buildGmailActions, createGoogleConnector, googleHosts } from '@heynixie/connectors';
import { createCredentialRecorder } from '@heynixie/credentials';
import type { ErasureRegistry } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { FetchReply } from '@heynixie/wire';
import { buildTestGoogleHosts } from '../test/build-test-google-hosts';
import type { ServerParts } from '../types';
import { readMailHTML } from './read-mail-html';

type HTMLReader = (html: string) => Promise<FetchReply>;

export interface ServerConnections extends Connections {
  // the fetch sandbox's HTML reader, once it runs; a mail's HTML reads as unsupported before that
  readonly bindHTMLReader: (read: HTMLReader) => void;
}

const sweepIntervalMs = 60 * 60 * 1000;
const checkIntervalMs = 24 * 60 * 60 * 1000;

// Starts the credential store's database backend and registers the connection's erasable. Each start
// closes the refreshes a crash lost, sweeps keys and lapsed consents, and records `unknown` for a
// forget with no revocation outcome. A daily pass checks each connection's scopes.
export async function startConnectionsPart(
  parts: ServerParts,
  erasure: ErasureRegistry,
  googleURL: string | null,
): Promise<ServerConnections> {
  const log = parts.context.log;
  const definitions = parts.context.definitions;
  const now = () => parts.context.clock.now();

  const wiring = parts.heldSlot.bind(() => {
    const recorder = createCredentialRecorder({ log, definitions });

    return { backend: createDatabaseHeldBackend({ log, definitions, recorder, now }), recorder };
  });

  const backend = wiring.backend;
  const store = parts.credentials.store;

  const hosts =
    !NIXIE_TEST_BUILD || googleURL === null ? googleHosts : buildTestGoogleHosts(googleURL);

  const holder: { started: Connections | null; readHTML: HTMLReader | null } = {
    started: null,
    readHTML: null,
  };

  const webFetch = parts.config.web_fetch;

  const actions = buildGmailActions({
    hosts,
    access: {
      readLiveContexts: async (connection) => {
        const started = holder.started;

        return started === null ? [] : await started.readLiveContexts(connection);
      },
    },
    log,
    clock: parts.context.clock,
    readHTML: (html) => readMailHTML(holder.readHTML, html),
    textBytes: webFetch.limits.textBytes,
    linkPathChars: webFetch.linkPathChars,
    imageLongEdge: webFetch.imageLongEdge,
  });

  const connections = startConnections({
    log,
    definitions,
    store,
    backend,
    erasure,
    now,
    connector: createGoogleConnector(hosts, actions),
  });

  holder.started = connections;

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

  return {
    ...connections,
    bindHTMLReader: (read) => {
      holder.readHTML = read;
    },
  };
}
