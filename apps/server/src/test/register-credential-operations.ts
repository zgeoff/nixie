import type { ConnectionTables } from '@heynixie/connections';
import { startConnections } from '@heynixie/connections';
import { buildHeldSpec } from '@heynixie/credentials/test-build';
import type { ErasureRegistry, KeyStoreTables } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { buildNixieOperationSchemas } from '../part/build-nixie-operation-schemas';
import { createTestCredentialStore } from './create-test-credential-store';

// The operations a credential crash test calls: connect a credential against a fake provider,
// refresh it, forget it, and read what each left. The provider is a loopback HTTPS site in the test
// process.
export function registerCredentialOperations(
  link: HarnessLink,
  context: TasksContext,
  erasure: ErasureRegistry,
): void {
  const schemas = buildNixieOperationSchemas();

  link.registerOperation('connectCredential', schemas.connectCredential, async (args) => {
    const held = await createTestCredentialStore(context, args.ca);

    await held.backend.writeClient(args.clientCredentialID, {
      clientID: 'client-123',
      clientSecret: 'fake-client-secret',
    });

    const client = await held.store.register(
      { backend: 'database', credentialID: args.clientCredentialID },
      buildHeldSpec(args, 'oauth_client'),
    );

    await held.store.exchange(client, {
      code: 'fake-code',
      redirectURI: 'https://nixie.example/callback',
      credentialID: args.tokenCredentialID,
    });

    return null;
  });

  link.registerOperation('refreshCredential', schemas.refreshCredential, async (args) => {
    const waitAt = (point: string) =>
      link.waitAtFaultPoint(point, { kind: 'credential', id: args.tokenCredentialID });

    const held = await createTestCredentialStore(context, args.ca, {
      beforeTokenWrite: () => waitAt('credential.refresh.before_save'),
      afterTokenSaved: () => waitAt('credential.refresh.token_saved'),
    });

    const token = await held.store.register(
      { backend: 'database', credentialID: args.tokenCredentialID },
      buildHeldSpec(args, 'oauth_token'),
    );

    return held.store.refresh(token);
  });

  link.registerOperation('readCredentialStatus', schemas.readCredentialStatus, async (args) => {
    const held = await createTestCredentialStore(context, args.ca);

    const token = await held.store.register(
      { backend: 'database', credentialID: args.tokenCredentialID },
      buildHeldSpec(args, 'oauth_token'),
    );

    const state = await held.store.readStatus(token);

    return state?.status ?? null;
  });

  // The number N of the fake provider's `fake-refresh-token-N` that the credential holds, or null.
  // It never returns the token.
  link.registerOperation('readCredentialToken', schemas.readCredentialToken, async (args) => {
    const held = await createTestCredentialStore(context, args.ca);
    const token = await held.backend.readToken(args.tokenCredentialID);

    const generation = /^fake-refresh-token-(?<number>\d+)$/u.exec(token?.refreshToken ?? '');

    return generation?.groups?.['number'] === undefined
      ? null
      : Number(generation.groups['number']);
  });

  // The credential keys that the key store holds: the ones a connection row or an OAuth client row
  // names, and the ones a mark names that no row does.
  link.registerOperation('readCredentialKeys', schemas.readCredentialKeys, async () => {
    const tables = context.log.writer.db.$extendTables<ConnectionTables>();

    const connections = await tables
      .selectFrom('connections')
      .select(['key_id', 'token_key_id'])
      .execute();

    const clients = await tables.selectFrom('oauth_clients').select('key_id').execute();
    const marks = await tables.selectFrom('key_marks').select('key_id').execute();

    const credentialKeys = new Set([
      ...connections.flatMap((row) => [row.key_id, row.token_key_id ?? '']),
      ...clients.map((row) => row.key_id),
      ...marks.map((row) => row.key_id),
    ]);

    const stored = await context.log.writer.keys
      .$extendTables<KeyStoreTables>()
      .selectFrom('record_keys')
      .select('key_id')
      .execute();

    return stored.filter((row) => credentialKeys.has(row.key_id)).length;
  });

  link.registerOperation('forgetConnection', schemas.forgetConnection, async (args) => {
    const held = await createTestCredentialStore(context, args.ca);

    const connections = startConnections({
      log: context.log,
      definitions: context.definitions,
      store: held.store,
      backend: held.backend,
      erasure,
      now: () => Date.now(),
      endpoints: {
        tokenURL: args.tokenURL,
        revokeURL: args.revokeURL,
        issuer: 'https://issuer.example',
        origins: [args.origin],
      },
    });

    await connections.forget.begin({ connection: args.tokenCredentialID }, { by: 'user' });
    await connections.forget.finish(args.tokenCredentialID);

    return null;
  });
}
