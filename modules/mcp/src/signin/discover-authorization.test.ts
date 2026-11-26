import { expect, test } from 'bun:test';
import { discoverAuthorization } from './discover-authorization';
import type { DiscoveryFetch } from './discover-authorization';

function setupTest() {
  const serverURL = 'https://tracker.example.test/mcp';

  const answer = (url: string, issuer: string, endpointOrigin: string): Response => {
    if (url.includes('oauth-protected-resource')) {
      return Response.json({ resource: serverURL, authorization_servers: [issuer] });
    }

    if (url.includes('oauth-authorization-server')) {
      return Response.json({
        issuer,
        authorization_endpoint: `${endpointOrigin}/authorize`,
        token_endpoint: `${endpointOrigin}/token`,
        code_challenge_methods_supported: ['S256'],
      });
    }

    return new Response('', { status: 401 });
  };

  const buildFetch =
    (issuer: string, endpointOrigin: string): DiscoveryFetch =>
    () =>
    (input) =>
      Promise.resolve(answer(String(input), issuer, endpointOrigin));

  return {
    discover: (endpointOrigin: string) =>
      discoverAuthorization(
        buildFetch('https://auth.example.test', endpointOrigin),
        serverURL,
        AbortSignal.timeout(1000),
      ),
  };
}

test('it takes an authorization endpoint over http on a loopback host in a test build', async () => {
  const ctx = setupTest();

  const found = await ctx.discover('http://127.0.0.1:4000');

  expect(found).toStrictEqual({
    issuer: 'https://auth.example.test',
    authorizeURL: 'http://127.0.0.1:4000/authorize',
    tokenURL: 'http://127.0.0.1:4000/token',
    revokeURL: null,
  });
});

test('it refuses an authorization endpoint over http on a host that is not loopback', async () => {
  const ctx = setupTest();

  const found = await ctx.discover('http://auth.example.test');

  expect(found).toStrictEqual({ failure: 'an endpoint of the authorization server is not https' });
});
