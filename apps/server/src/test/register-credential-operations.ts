import { buildHeldSpec } from '@heynixie/credentials/test-build';
import type { TasksContext } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { buildNixieOperationSchemas } from '../part/build-nixie-operation-schemas';
import { createTestCredentialStore } from './create-test-credential-store';

// The operations a credential crash test calls: connect a credential against a fake provider,
// refresh it, and read its status. The provider is a loopback HTTPS site in the test process.
export function registerCredentialOperations(link: HarnessLink, context: TasksContext): void {
  const schemas = buildNixieOperationSchemas();

  link.registerOperation('connectCredential', schemas.connectCredential, async (args) => {
    const held = await createTestCredentialStore(context, args.ca);

    await held.backend.writeClient(args.clientCredentialID, { clientSecret: 'fake-client-secret' });

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
    const held = await createTestCredentialStore(context, args.ca);

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
}
