import { CredentialRefusalError } from '@heynixie/egress';
import type { FetcherTarget } from './create-credential-fetcher';
import { isRefusedOAuthURL } from './is-refused-oauth-url';

export function refuseOrigin(target: FetcherTarget, url: URL): void {
  if (!target.origins.includes(url.origin)) {
    throw new CredentialRefusalError(`${url.origin} is not an origin this credential may reach`);
  }

  if (url.protocol !== 'https:' && target.options.deploymentService !== true) {
    throw new CredentialRefusalError(`${url.origin} is not an https origin`);
  }

  if (target.oauthHostnames !== undefined && isRefusedOAuthURL(url, target.oauthHostnames)) {
    throw new CredentialRefusalError(`${url.origin}${url.pathname} is an OAuth endpoint`);
  }
}
