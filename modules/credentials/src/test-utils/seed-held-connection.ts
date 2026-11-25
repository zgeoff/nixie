import type { CredentialStore } from '../create-credential-store';
import type { HeldBackend } from '../held/types';
import type { BindingRef, DatabaseCredentialRef } from '../types';
import { buildHeldSpec } from './build-held-spec';
import type { FakeOAuthProvider } from './start-fake-oauth-provider';

// What a seed needs of a test store: any backend that writes a client.
export interface HeldConnectionStore {
  readonly store: CredentialStore;
  readonly backend: Pick<HeldBackend, 'writeClient'>;
}

export interface HeldConnection {
  readonly clientRef: DatabaseCredentialRef;
  readonly tokenRef: DatabaseCredentialRef;
  readonly client: BindingRef<'database'>;
  readonly token: BindingRef<'database'>;
}

// Connects an OAuth credential the way the owner's consent does: an OAuth client with a secret,
// and one exchange of a code for the token. The provider's default answer gives the token
// fake-access-token-1 and fake-refresh-token-1.
export async function seedHeldConnection(
  held: HeldConnectionStore,
  provider: FakeOAuthProvider,
): Promise<HeldConnection> {
  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;
  const tokenRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;

  await held.backend.writeClient(clientRef.credentialID, {
    clientID: 'client-123',
    clientSecret: 'fake-client-secret-value',
  });

  const client = await held.store.register(clientRef, buildHeldSpec(provider, 'oauth_client'));

  await held.store.exchange(client, {
    code: 'fake-code',
    redirectURI: 'https://nixie.example/callback',
    credentialID: tokenRef.credentialID,
  });

  const token = await held.store.register(tokenRef, buildHeldSpec(provider, 'oauth_token'));

  return { clientRef, tokenRef, client, token };
}
