import type { CredentialFetch } from '@heynixie/credentials';
import { z } from 'zod';

export interface DiscoveredAuthorization {
  readonly issuer: string;
  readonly authorizeURL: string;
  readonly tokenURL: string;
  readonly revokeURL: string | null;
}

// Sends one request to a URL, through a fetcher whose origins the caller chose.
export type DiscoveryFetch = (origins: readonly string[]) => CredentialFetch;

const resourceMetadataSchema = z.object({
  resource: z.string(),
  authorization_servers: z.array(z.string()).min(1),
});

// Follows the MCP standard from a 401 with `resource_metadata`, to the protected resource metadata,
// to the authorization server's metadata. A step that fails gives a failure with its reason.
export async function discoverAuthorization(
  fetchFrom: DiscoveryFetch,
  serverURL: string,
  signal: AbortSignal,
): Promise<DiscoveredAuthorization | { readonly failure: string }> {
  const server = new URL(serverURL);

  const challenge = await fetchFrom([server.origin])(serverURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }),
    signal,
  });

  const header = challenge.headers.get('www-authenticate') ?? '';
  const named = /resource_metadata="(?<url>[^"]+)"/u.exec(header)?.groups?.['url'];

  const metadataURL =
    named ?? `${server.origin}/.well-known/oauth-protected-resource${server.pathname}`;

  const resource = await readJSON(fetchFrom, metadataURL, signal);

  const parsedResource = resourceMetadataSchema.safeParse(resource);

  if (!parsedResource.success) {
    return { failure: 'the protected resource metadata is missing or unreadable' };
  }

  if (toCanonical(parsedResource.data.resource) !== toCanonical(serverURL)) {
    return { failure: 'the protected resource metadata names another resource' };
  }

  const issuer = parsedResource.data.authorization_servers[0] ?? '';

  return discoverEndpoints(fetchFrom, issuer, signal);
}

async function readJSON(
  fetchFrom: DiscoveryFetch,
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  if (!URL.canParse(url)) {
    return null;
  }

  const response = await fetchFrom([new URL(url).origin])(url, { signal });

  if (!response.ok) {
    return null;
  }

  const body: unknown = await response.json().catch(() => null);

  return body;
}

function toCanonical(url: string): string {
  return url.replace(/\/+$/u, '');
}

const serverMetadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  revocation_endpoint: z.string().optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});

async function discoverEndpoints(
  fetchFrom: DiscoveryFetch,
  issuer: string,
  signal: AbortSignal,
): Promise<DiscoveredAuthorization | { readonly failure: string }> {
  if (!URL.canParse(issuer)) {
    return { failure: 'the authorization server is not a URL' };
  }

  const url = new URL(issuer);

  const path = url.pathname === '/' ? '' : url.pathname;

  const metadata = await readJSON(
    fetchFrom,
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
    signal,
  );

  const parsed = serverMetadataSchema.safeParse(metadata);

  if (!parsed.success || toCanonical(parsed.data.issuer) !== toCanonical(issuer)) {
    return { failure: 'the authorization server metadata is missing or names another issuer' };
  }

  const methods = parsed.data.code_challenge_methods_supported ?? [];

  if (!methods.includes('S256')) {
    return { failure: 'the authorization server does not offer PKCE with S256' };
  }

  const endpoints = [parsed.data.authorization_endpoint, parsed.data.token_endpoint];

  if (
    !endpoints.every(
      (endpoint) => URL.canParse(endpoint) && isSecureProtocol(new URL(endpoint).protocol),
    )
  ) {
    return { failure: 'an endpoint of the authorization server is not https' };
  }

  return {
    issuer: parsed.data.issuer,
    authorizeURL: parsed.data.authorization_endpoint,
    tokenURL: parsed.data.token_endpoint,
    revokeURL: parsed.data.revocation_endpoint ?? null,
  };
}

// A test build also takes http, for the stand-in server on a loopback port.
function isSecureProtocol(protocol: string): boolean {
  return protocol === 'https:' || (NIXIE_TEST_BUILD && protocol === 'http:');
}
