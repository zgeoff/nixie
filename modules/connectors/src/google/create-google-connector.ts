import type { Connector } from '../types';
import { buildGoogleOAuthSpec } from './build-google-oauth-spec';
import { checkGoogleScopes } from './check-google-scopes';
import { googleHosts } from './google-hosts';
import type { GoogleHosts } from './google-hosts';
import { googleSetupSteps } from './google-setup-steps';

// The Google connector. It holds no action yet: the Gmail, Calendar and Drive tools join it as they
// are built.
export function createGoogleConnector(hosts: GoogleHosts = googleHosts): Connector {
  const auth = buildGoogleOAuthSpec(hosts);

  return {
    id: 'google',
    auth,
    setup: googleSetupSteps,
    actions: [],
    check: (_connection, context) => checkGoogleScopes(hosts, auth.scopes, context),
  };
}
