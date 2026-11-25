import type { ConnectorContext, HealthReport, MissingScope } from '../types';
import { classifyScopeRead } from './classify-scope-read';
import type { GoogleHosts } from './google-hosts';

export class ScopeCheckError extends Error {
  override readonly name = 'ScopeCheckError';
}

// The read call that proves each scope: the cheapest list the scope allows.
export function buildScopeReadURLs(hosts: GoogleHosts): Readonly<Record<string, string>> {
  return {
    'gmail.modify': `${hosts.gmailOrigin}/gmail/v1/users/me/labels`,
    'calendar.events': `${hosts.apisOrigin}/calendar/v3/calendars/primary/events?maxResults=1`,
    'calendar.calendarlist.readonly': `${hosts.apisOrigin}/calendar/v3/users/me/calendarList?maxResults=1`,
    'drive.file': `${hosts.apisOrigin}/drive/v3/files?pageSize=1&fields=files(id)`,
  };
}

// One read call for each scope the connector asks for. A call whose answer says nothing about the
// scope, such as a server error, fails the whole check, so a connection keeps what the last check
// found instead of losing or gaining a scope on a guess.
export async function checkGoogleScopes(
  hosts: GoogleHosts,
  scopes: readonly string[],
  context: ConnectorContext,
): Promise<HealthReport> {
  const urls = buildScopeReadURLs(hosts);
  const grantedScopes: string[] = [];
  const missing: MissingScope[] = [];

  for (const scope of scopes) {
    const url = urls[scope];

    if (url === undefined) {
      throw new ScopeCheckError(`no read call proves the scope ${scope}`);
    }

    const response = await context.fetch(url);
    const body = await response.text();

    const verdict = classifyScopeRead(response.status, body);

    if (verdict === 'unknown') {
      throw new ScopeCheckError(`the read for ${scope} answered ${String(response.status)}`);
    }

    if (verdict === 'granted') {
      grantedScopes.push(scope);
    } else {
      missing.push({ scope, reason: verdict });
    }
  }

  return { grantedScopes, accountName: null, missing };
}
