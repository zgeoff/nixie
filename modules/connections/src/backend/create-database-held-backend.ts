import type { HeldBackend } from '@heynixie/credentials';
import type { BackendOptions, ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';
import { mintKey, removeKey } from './mint-key';
import { readClientSecret } from './read-client-secret';
import { readConnectionToken, readRevocableToken } from './read-connection-token';
import { removeCredential } from './remove-credential';
import { sweepOrphanKeys } from './sweep-orphan-keys';
import { writeClientSecret } from './write-client-secret';
import { writeConnectionState } from './write-connection-state';
import { writeToken } from './write-token';

export interface DatabaseHeldBackend extends HeldBackend {
  // Deletes each marked key that no row and no unfinished refresh names. A start runs it after the
  // refreshes that a crash lost are closed, and an hourly pass runs it beside live refreshes.
  readonly sweepKeys: () => Promise<readonly string[]>;
}

// The credential store's backend over the connections tables of nixie.db and the key store. Each
// OAuth client's secret and each connection's refresh token and account sit under a key of their
// own. Access tokens stay in memory, so a restart costs one refresh at the first use.
export function createDatabaseHeldBackend(options: BackendOptions): DatabaseHeldBackend {
  const context: BackendContext = {
    ...options,
    heldKeys: new Set(),
    accessTokens: new Map(),
  };

  return {
    readRemovalCounter: async (credentialID) => {
      const tables = context.log.writer.db.$extendTables<ConnectionTables>();

      const connection = await tables
        .selectFrom('connections')
        .select('removal_counter')
        .where('connection_id', '=', credentialID)
        .executeTakeFirst();

      if (connection !== undefined) {
        return connection.removal_counter;
      }

      const client = await tables
        .selectFrom('oauth_clients')
        .select('removal_counter')
        .where('oauth_client_id', '=', credentialID)
        .executeTakeFirst();

      return client?.removal_counter ?? 0;
    },
    readClient: (credentialID) => readClientSecret(context, credentialID),
    writeClient: (credentialID, client) => writeClientSecret(context, credentialID, client),
    readToken: (credentialID) => readConnectionToken(context, credentialID),
    readTokenForRevocation: (credentialID) => readRevocableToken(context, credentialID),
    writeToken: (credentialID, token, guard, record) =>
      writeToken(context, { credentialID, token, guard, record }),
    writeState: (credentialID, state, expectedCounter) =>
      writeConnectionState(context, credentialID, state, expectedCounter),
    createKey: async () => {
      const minted = await mintKey(context);

      if (NIXIE_TEST_BUILD) {
        await context.hooks?.afterKeyCreated?.(minted.keyID);
      }

      return minted.keyID;
    },
    removeKey: (keyID) => removeKey(context, keyID),
    remove: (credentialID) => removeCredential(context, credentialID),
    sweepKeys: () => sweepOrphanKeys(context),
  };
}
