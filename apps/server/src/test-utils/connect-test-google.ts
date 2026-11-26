import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import invariant from 'tiny-invariant';

interface SignedInClient {
  readonly url: string;
  readonly token: string;
}

export interface ConnectedGoogle {
  // the connection's short ID, which the tools and a forget take
  readonly connection: string;
}

// Registers an OAuth client and connects the one account of the fake Google site, as the owner does
// from the connections page. The page's origin is the server's own, which a test build accepts over
// plain HTTP.
export async function connectTestGoogle(signedIn: SignedInClient): Promise<ConnectedGoogle> {
  const client = createORPCClient<ContractClient>(
    new RPCLink({
      url: `${signedIn.url}/rpc`,
      headers: {
        [clientHeaderName]: 'test',
        authorization: `Bearer ${signedIn.token}`,
        origin: signedIn.url,
      },
    }),
  );

  await client.connections.registerClient({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    clientID: 'e2e-client.apps.test',
    clientSecret: 'e2e-client-secret-value',
    origin: signedIn.url,
  });

  const started = await client.connections.startConsent({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    connection: null,
  });

  const state = new URL(started.consentURL).searchParams.get('state');

  invariant(state !== null, 'the consent URL holds a state');

  const finished = await client.connections.finishConsent({
    state,
    code: 'e2e-code',
    error: null,
  });

  return { connection: finished.connection };
}
