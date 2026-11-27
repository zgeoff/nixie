import type { OAuthSpec } from '@heynixie/connections';
import type { GoogleHosts } from './google-hosts';

// The one source of Google's endpoints, scopes and consent parameters: the connections module reads
// the credential store's provider from it.
export function buildGoogleOAuthSpec(hosts: GoogleHosts): OAuthSpec {
  return {
    kind: 'oauth',
    name: 'Google',
    authorizeURL: hosts.authorizeURL,
    tokenURL: hosts.tokenURL,
    revokeURL: hosts.revokeURL,
    issuer: hosts.issuer,
    identityScopes: ['openid', 'email'],
    scopes: ['gmail.modify', 'calendar.events', 'calendar.calendarlist.readonly', 'drive.file'],
    scopePrefix: 'https://www.googleapis.com/auth/',
    authorizeParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
    origins: [hosts.gmailOrigin, hosts.apisOrigin],
    returnPath: '/connections/google/return',
  };
}
