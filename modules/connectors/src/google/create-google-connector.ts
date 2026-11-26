import type { Connector, ConnectorAction } from '../types';
import { buildGoogleOAuthSpec } from './build-google-oauth-spec';
import { checkGoogleScopes } from './check-google-scopes';
import { googleHosts } from './google-hosts';
import type { GoogleHosts } from './google-hosts';
import { googleSetupSteps } from './google-setup-steps';

// The Google connector, with the tools that it holds: the Gmail tools join it, and the Calendar and
// Drive tools join as they are built.
export function createGoogleConnector(
  hosts: GoogleHosts = googleHosts,
  actions: readonly ConnectorAction[] = [],
): Connector {
  const auth = buildGoogleOAuthSpec(hosts);

  return {
    id: 'google',
    auth,
    setup: googleSetupSteps,
    actions,
    check: (_connection, context) => checkGoogleScopes(hosts, auth.scopes, context),
  };
}
