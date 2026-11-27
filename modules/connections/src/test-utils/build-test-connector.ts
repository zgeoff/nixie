import type { Connector, ConnectorContext, HealthReport, OAuthSpec } from '../connector/types';

export interface TestConnectorHosts {
  readonly authorizeURL: string;
  readonly tokenURL: string;
  readonly revokeURL: string;
  readonly issuer: string;
  readonly apiOrigin: string;
}

// A connector that reads one URL on the fake provider for each scope, and reads the answer as a
// provider that refuses an ungranted scope with 403 would give it.
export function buildTestConnector(hosts: TestConnectorHosts): Connector {
  return {
    id: 'google',
    auth: buildTestOAuthSpec(hosts),
    setup: [
      { id: 'project', title: 'project', body: 'project', links: [] },
      { id: 'apis', title: 'apis', body: 'apis', links: [] },
      { id: 'branding', title: 'branding', body: 'branding', links: [] },
      { id: 'audience', title: 'audience', body: 'audience', links: [] },
      {
        id: 'client',
        title: 'client',
        body: 'Use {redirectURI} with the origin {origin}.',
        links: [],
        input: 'oauth_client',
      },
      { id: 'consent', title: 'consent', body: 'consent', links: [] },
    ],
    actions: [],
    check: (_connection, context) => readTestHealth(hosts, context),
  };
}

export const testConnectorScopes = [
  'gmail.modify',
  'calendar.events',
  'calendar.calendarlist.readonly',
  'drive.file',
] as const;

export function buildTestOAuthSpec(hosts: TestConnectorHosts): OAuthSpec {
  return {
    kind: 'oauth',
    name: 'Google',
    authorizeURL: hosts.authorizeURL,
    tokenURL: hosts.tokenURL,
    revokeURL: hosts.revokeURL,
    issuer: hosts.issuer,
    identityScopes: ['openid', 'email'],
    scopes: testConnectorScopes,
    scopePrefix: 'https://www.googleapis.com/auth/',
    authorizeParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
    origins: [hosts.apiOrigin],
    returnPath: '/connections/google/return',
  };
}

const readPaths: Readonly<Record<string, string>> = {
  'gmail.modify': '/gmail/v1/users/me/labels',
  'calendar.events': '/calendar/v3/calendars/primary/events?maxResults=1',
  'calendar.calendarlist.readonly': '/calendar/v3/users/me/calendarList?maxResults=1',
  'drive.file': '/drive/v3/files?pageSize=1&fields=files(id)',
};

async function readTestHealth(
  hosts: TestConnectorHosts,
  context: ConnectorContext,
): Promise<HealthReport> {
  const grantedScopes: string[] = [];
  const missing: HealthReport['missing'][number][] = [];

  for (const scope of testConnectorScopes) {
    const response = await context.fetch(`${hosts.apiOrigin}${readPaths[scope] ?? ''}`);
    const body = await response.text();

    if (response.ok) {
      grantedScopes.push(scope);
    } else if ((response.status === 401 || response.status === 403) && !isQuota(body)) {
      missing.push({
        scope,
        reason: body.includes('accessNotConfigured') ? 'api_disabled' : 'not_granted',
      });
    } else {
      throw new Error(`the read for ${scope} answered ${String(response.status)}`);
    }
  }

  return { grantedScopes, accountName: null, missing };
}

function isQuota(body: string): boolean {
  return [
    'userRateLimitExceeded',
    'rateLimitExceeded',
    'RATE_LIMIT_EXCEEDED',
    'dailyLimitExceeded',
    'quotaExceeded',
    'RESOURCE_EXHAUSTED',
  ].some((reason) => body.includes(reason));
}
