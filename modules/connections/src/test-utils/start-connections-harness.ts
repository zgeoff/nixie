import type { FakeOAuthProvider, HeldConnection } from '@heynixie/credentials/test-utils';
import {
  seedHeldConnection,
  startCredentialTestLog,
  startFakeOAuthProvider,
} from '@heynixie/credentials/test-utils';
import type { ErasureRunnerControl, KeyStoreTables, Log } from '@heynixie/log';
import { makeErasureRunner } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { Connections } from '../start-connections';
import { startConnections } from '../start-connections';
import type { DatabaseTestStore } from '../test-build/create-database-test-store';
import { createDatabaseTestStore } from '../test-build/create-database-test-store';
import type { BackendHooks, ClientRow, ConnectionRow, ConnectionTables } from '../types';
import type { HarnessEffects } from './build-harness-effects';
import { buildHarnessEffects } from './build-harness-effects';

type MutableHooks = {
  -readonly [Name in keyof BackendHooks]: BackendHooks[Name];
};

export interface ConnectionsHarnessOptions {
  // how long a request to the provider's token endpoint may take, in ms
  readonly tokenRequestTimeoutMs?: number;
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
  readonly clock: { readonly now: () => number };

  // Connects an OAuth client and one connection, as a consent does. The token is
  // fake-access-token-1 and the refresh token fake-refresh-token-1.
  readonly seedConnection: () => Promise<HeldConnection>;

  // the IDs of the keys in the key store
  readonly readKeyIDs: () => Promise<readonly string[]>;

  // the stored row of a connection, which a test reads to see what a forget left in it
  readonly readRow: (connectionID: string) => Promise<ConnectionRow | null>;

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
  const provider = await startFakeOAuthProvider();

  const clock = createFakeClock({ startMs: Date.parse('2026-11-20T09:00:00Z') });

  const testLog = await startCredentialTestLog({ clock });

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

  const connections = startConnections({
    log: testLog.log,
    definitions: () => ({ snapshotHash: 'test-snapshot' }),
    store: held.store,
    backend: held.backend,
    erasure: runner,
    now: () => clock.now(),
    endpoints: {
      tokenURL: provider.tokenURL,
      revokeURL: provider.revokeURL,
      issuer: 'https://issuer.example',
      origins: [provider.origin],
    },
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
