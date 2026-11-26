import { CredentialRefusalError, isLoopbackHost, toBareHost } from '@heynixie/egress';
import type { FetcherTarget } from './create-credential-fetcher';
import { isRefusedOAuthURL } from './is-refused-oauth-url';

export function refuseOrigin(target: FetcherTarget, url: URL): void {
  if (!target.origins.includes(url.origin)) {
    throw new CredentialRefusalError(`${url.origin} is not an origin this credential may reach`);
  }

  // A test build also takes http to a loopback host that a pairing names, for the stand-in MCP
  // server on a loopback port.
  const isHTTP =
    NIXIE_TEST_BUILD &&
    url.protocol === 'http:' &&
    isLoopbackHost(url.hostname) &&
    target.options.pairing !== undefined &&
    toBareHost(url.hostname) === target.options.pairing.host;

  if (url.protocol !== 'https:' && !isHTTP && target.options.deploymentService !== true) {
    throw new CredentialRefusalError(`${url.origin} is not an https origin`);
  }

  if (target.oauthHostnames !== undefined && isRefusedOAuthURL(url, target.oauthHostnames)) {
    throw new CredentialRefusalError(`${url.origin}${url.pathname} is an OAuth endpoint`);
  }
}
