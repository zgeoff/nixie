import type {
  BindingRef,
  CredentialFetch,
  CredentialSpec,
  CredentialStore,
  FetchOptions,
} from '@heynixie/credentials';
import type { McpServerRow } from '../rows/mcp-tables';
import { toFactsInUse } from '../rows/to-facts-in-use';
import type { ServerFacts } from '../types';
import { discoverAuthorization } from './discover-authorization';
import type { DiscoveredAuthorization } from './discover-authorization';

// What the proxy needs to act for one server: the server's OAuth client and grant in the credential
// store, and where its authorization server answers.
export interface ServerBindings {
  readonly serverID: string;
  readonly facts: ServerFacts;
  readonly discovered: DiscoveredAuthorization;
  readonly client: BindingRef<'database'>;
  readonly grant: BindingRef<'database'>;
  readonly clientCredentialID: string;
  readonly grantCredentialID: string;
}

export type BindingsOutcome =
  | { readonly kind: 'bound'; readonly bindings: ServerBindings }
  | { readonly kind: 'failed'; readonly reason: string };

export interface BindingsRuntime {
  readonly store: CredentialStore;
  readonly timeoutMs: number;

  // what discovery found, by server, so a refresh after a restart still knows the token URL
  readonly discoveries: Map<
    string,
    { readonly key: string; readonly found: DiscoveredAuthorization }
  >;
}

// Finds the server's authorization server, and registers its client and grant with the store. A
// server with no facts in use, or no credentials, has no bindings.
export async function readBindings(
  runtime: BindingsRuntime,
  server: McpServerRow,
): Promise<BindingsOutcome> {
  const facts = toFactsInUse(server);
  const clientID = server.client_credential_id;
  const grantID = server.grant_credential_id;

  if (facts === null || clientID === null || grantID === null) {
    return { kind: 'failed', reason: 'the server has no facts in use or no credentials yet' };
  }

  const discovered = await readDiscovery(runtime, server.server_id, facts);

  if ('failure' in discovered) {
    return { kind: 'failed', reason: discovered.failure };
  }

  const found = discovered.found;

  const client = await runtime.store.register(
    { backend: 'database', credentialID: clientID },
    buildSpec('oauth_client', server.server_id, facts, found),
  );

  const grant = await runtime.store.register(
    { backend: 'database', credentialID: grantID },
    buildSpec('oauth_token', server.server_id, facts, found),
  );

  return {
    kind: 'bound',
    bindings: {
      serverID: server.server_id,
      facts,
      discovered: found,
      client,
      grant,
      clientCredentialID: clientID,
      grantCredentialID: grantID,
    },
  };
}

// The fetcher for a request to the server's URL: its host may sit on a private network when the
// config pairs the host with a range, and a redirect is never followed.
export function buildFetchOptions(facts: ServerFacts): FetchOptions {
  return {
    redirects: 'none',
    stream: true,
    ...(facts.privateRange === null
      ? {}
      : { pairing: { host: new URL(facts.url).hostname, range: facts.privateRange } }),
  };
}

export function makeDiscoveryFetch(
  store: CredentialStore,
  facts: ServerFacts,
): (origins: readonly string[]) => CredentialFetch {
  return (origins) => store.fetcher(null, origins, buildFetchOptions(facts));
}

async function readDiscovery(
  runtime: BindingsRuntime,
  serverID: string,
  facts: ServerFacts,
): Promise<{ readonly found: DiscoveredAuthorization } | { readonly failure: string }> {
  const key = `${facts.url}|${facts.clientID}`;
  const cached = runtime.discoveries.get(serverID);

  if (cached?.key === key) {
    return { found: cached.found };
  }

  try {
    const discovered = await discoverAuthorization(
      makeDiscoveryFetch(runtime.store, facts),
      facts.url,
      AbortSignal.timeout(runtime.timeoutMs),
    );

    if ('failure' in discovered) {
      return discovered;
    }

    runtime.discoveries.set(serverID, { key, found: discovered });

    return { found: discovered };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : 'the discovery failed' };
  }
}

function buildSpec(
  kind: 'oauth_client' | 'oauth_token',
  serverID: string,
  facts: ServerFacts,
  found: DiscoveredAuthorization,
): CredentialSpec {
  const origins = [
    new URL(facts.url).origin,
    new URL(found.tokenURL).origin,
    ...(found.revokeURL === null ? [] : [new URL(found.revokeURL).origin]),
  ];

  return {
    kind,
    label: `MCP server ${serverID}`,
    origins: [...new Set(origins)],
    provider: {
      tokenURL: found.tokenURL,
      ...(found.revokeURL === null ? {} : { revokeURL: found.revokeURL }),
      authorizeURL: found.authorizeURL,
      issuer: found.issuer,
      clientID: facts.clientID,
      resource: facts.url,
    },
  };
}
