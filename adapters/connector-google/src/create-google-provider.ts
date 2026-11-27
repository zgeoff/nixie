import type { GoogleHosts, GoogleProvider } from '@heynixie/google';
import { buildGoogleOAuthSpec } from './build-google-oauth-spec';
import { checkGoogleScopes } from './check-google-scopes';
import { googleHosts } from './google-hosts';
import { googleSetupSteps } from './google-setup-steps';

// Google behind the Google feature: its hosts, its OAuth consent, its setup steps and the scope check
// of an account. A test passes the hosts of a fake site.
export function createGoogleProvider(hosts: GoogleHosts = googleHosts): GoogleProvider {
  const auth = buildGoogleOAuthSpec(hosts);

  return {
    hosts,
    auth,
    setup: googleSetupSteps,
    check: (_connection, context) => checkGoogleScopes(hosts, auth.scopes, context),
  };
}
