import type { Connector } from '@heynixie/connectors';
import { createGoogleConnector } from '@heynixie/connectors';
import type { FakeOAuthProvider, HeldConnection } from '@heynixie/credentials/test-utils';
import {
  seedHeldConnection,
  startCredentialTestLog,
  startFakeOAuthProvider,
} from '@heynixie/credentials/test-utils';
import type { ErasureRunnerControl, KeyStoreTables, Log, RecordKind } from '@heynixie/log';
import { makeErasureRunner, readRecords } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { FakeClock } from '@zgeoff/testing/clock';
import type { ReadConnectionWakes } from '../erasure/start-connection-erasure';
import type { Connections } from '../start-connections';
import { startConnections } from '../start-connections';
import type { DatabaseTestStore } from '../test-build/create-database-test-store';
import { createDatabaseTestStore } from '../test-build/create-database-test-store';
import type {
  BackendHooks,
  ClientRow,
  ConnectionRow,
  ConnectionTables,
  ConsentRow,
} from '../types';
import type { HarnessEffects } from './build-harness-effects';
import { buildHarnessEffects } from './build-harness-effects';

type MutableHooks = {
  -readonly [Name in keyof BackendHooks]: BackendHooks[Name];
};

export interface ConnectionsHarnessOptions {
  // how long a request to the provider's token endpoint may take, in ms
  readonly tokenRequestTimeoutMs?: number;

  // how long a consent waits for the Forget of its account, in ms; 200 by default
  readonly forgetWaitMs?: number;

  // the actions that the connector holds; none by default, as Google's connector has none yet
  readonly actions?: Connector['actions'];

  // a log that another part of the test already runs on, in place of one of the harness's own
  readonly sharedLog?: { readonly log: Log; readonly dataDir: string };

  // wraps the clock the connections module reads, so a test can move time part way through a call
  readonly wrapNow?: (now: () => number) => () => number;

  // wraps the connector's check, so a test can act while a check is under way
  readonly wrapCheck?: (check: Connector['check']) => Connector['check'];

  // what a forget erases besides the connection's keys
  readonly eraseDependents?: (connectionID: string) => Promise<void>;

  // the wakes that show mail of a connection
  readonly readWakes?: ReadConnectionWakes;
}

export interface ConnectionsHarness {
  readonly log: Log;

  // the data directory that holds nixie.db and the key store
  readonly dataDir: string;
  readonly provider: FakeOAuthProvider;
  readonly held: DatabaseTestStore;
  readonly runner: ErasureRunnerControl;
  readonly effects: HarnessEffects;
  readonly connections: Connections;
  readonly clock: FakeClock;

  // Connects an OAuth client and one connection, as a consent does. The token is
  // fake-access-token-1 and the refresh token fake-refresh-token-1.
  readonly seedConnection: () => Promise<HeldConnection>;

  // the IDs of the keys in the key store
  readonly readKeyIDs: () => Promise<readonly string[]>;

  // the stored row of a connection, which a test reads to see what a forget left in it
  readonly readRow: (connectionID: string) => Promise<ConnectionRow | null>;

  // the IDs of the stored OAuth clients, in the order they were made
  readonly readClientIDs: () => Promise<string[]>;

  // the payload of each record of a kind
  readonly readRecordPayloads: (kind: RecordKind) => Promise<readonly Record<string, unknown>[]>;

  // every stored consent request
  readonly readConsentRows: () => Promise<ConsentRow[]>;

  // every stored connection row, in the order they were made
  readonly readRows: () => Promise<ConnectionRow[]>;

  // the stored row of an OAuth client, which a test reads to see how its secret is sealed
  readonly readClientRow: (clientID: string) => Promise<ClientRow | null>;

  // what a test sets, to hold the backend part way through a save
  readonly hooks: MutableHooks;
}

// A real log on disk, a fake Google provider, the credential store over the database backend, and an
// erasure runner whose effects touch nothing, with the connections module registered on it.
export async function startConnectionsHarness(
  options: ConnectionsHarnessOptions = {},
): Promise<ConnectionsHarness> {
  const provider = await startFakeOAuthProvider({ otherNames: ['accounts.test'] });

  const google = createGoogleConnector({
    authorizeURL: `${provider.origin.replace('auth.test', 'accounts.test')}/o/oauth2/v2/auth`,
    tokenURL: provider.tokenURL,
    revokeURL: provider.revokeURL,
    issuer: 'https://issuer.example',
    gmailOrigin: provider.apiOrigin,
    apisOrigin: provider.apiOrigin,
  });

  const connector: Connector = {
    ...google,
    actions: options.actions ?? google.actions,
    check: options.wrapCheck?.(google.check) ?? google.check,
  };

  const clock = createFakeClock({ startMs: Date.parse('2026-11-20T09:00:00Z') });

  const testLog = await (options.sharedLog ?? startCredentialTestLog({ clock }));

  const mutable: MutableHooks = {};

  const hooks: BackendHooks = {
    beforeTokenWrite: async (credentialID) => {
      await mutable.beforeTokenWrite?.(credentialID);
    },
    afterTokenSaved: async (credentialID) => {
      await mutable.afterTokenSaved?.(credentialID);
    },
  };

  const held = await createDatabaseTestStore({
    log: testLog.log,
    ca: provider.ca,
    now: () => clock.now(),
    tokenRequestTimeoutMs: options.tokenRequestTimeoutMs ?? 1000,
    hooks,
  });

  const effects = buildHarnessEffects();

  const runner = makeErasureRunner({
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'test-snapshot' }),
    effects: effects.effects,
  });

  const readNow = options.wrapNow?.(() => clock.now()) ?? (() => clock.now());

  const connections = startConnections({
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'test-snapshot' }),
    store: held.store,
    backend: held.backend,
    erasure: runner,
    now: readNow,
    connector,
    forgetWaitMs: options.forgetWaitMs ?? 200,
    forgetPollMs: 20,
    ...(options.eraseDependents === undefined ? {} : { eraseDependents: options.eraseDependents }),
    ...(options.readWakes === undefined ? {} : { readWakes: options.readWakes }),
  });

  return {
    log: testLog.log,
    dataDir: testLog.dataDir,
    provider,
    held,
    runner,
    effects,
    connections,
    clock,
    seedConnection: () => seedHeldConnection(held, provider),
    readKeyIDs: async () => {
      const rows = await testLog.log.writer.keys
        .$extendTables<KeyStoreTables>()
        .selectFrom('record_keys')
        .select('key_id')
        .execute();

      return rows.map((row) => row.key_id);
    },
    readRow: async (connectionID) => {
      const row = await testLog.log.writer.db
        .$extendTables<ConnectionTables>()
        .selectFrom('connections')
        .selectAll()
        .where('connection_id', '=', connectionID)
        .executeTakeFirst();

      return row ?? null;
    },
    readClientIDs: async () => {
      const rows = await testLog.log.writer.db
        .$extendTables<ConnectionTables>()
        .selectFrom('oauth_clients')
        .select('oauth_client_id')
        .orderBy('created_at')
        .execute();

      return rows.map((row) => row.oauth_client_id);
    },
    readRecordPayloads: async (kind) => {
      const records = await readRecords(testLog.log, { afterSequence: 0, kinds: [kind] });

      return records.map((entry) => entry.record.payload);
    },
    readConsentRows: () =>
      testLog.log.writer.db
        .$extendTables<ConnectionTables>()
        .selectFrom('consent_requests')
        .selectAll()
        .orderBy('created_at')
        .execute(),
    readRows: () =>
      testLog.log.writer.db
        .$extendTables<ConnectionTables>()
        .selectFrom('connections')
        .selectAll()
        .orderBy('created_at')
        .execute(),
    readClientRow: async (clientID) => {
      const row = await testLog.log.writer.db
        .$extendTables<ConnectionTables>()
        .selectFrom('oauth_clients')
        .selectAll()
        .where('oauth_client_id', '=', clientID)
        .executeTakeFirst();

      return row ?? null;
    },
    hooks: mutable,
  };
}
