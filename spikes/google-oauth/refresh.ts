// Refreshes the stored token and checks one call per API. Prints no secret. Run on day 1 and day 8.
// A throwaway script reads top to bottom, and its steps depend on each other in order.
// oxlint-disable one-var, sort-vars
import { $ } from 'bun';

const clientJSON = await $`op read op://nixie/google-oauth-client/google-oauth-client.json`.text(),
  client = JSON.parse(clientJSON).installed,
  refreshRead = await $`op read op://nixie/google-refresh-token/credential`.text(),
  consentedRead = await $`op read op://nixie/google-refresh-token/consented_at`.text(),
  refreshToken = refreshRead.trim(),
  consentedAt = consentedRead.trim(),
  res = await fetch(client.token_uri, {
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  }),
  token = await res.json(),
  days = ((Date.now() - Date.parse(consentedAt)) / 86_400_000).toFixed(2),
  failure = token.error ? ` ${token.error}: ${token.error_description}` : '';

console.log(`refresh after ${days} days: HTTP ${res.status}${failure}`);
if (!res.ok) {
  process.exit(1);
}

const checks = {
    calendar: 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1',
    drive: 'https://www.googleapis.com/drive/v3/files?pageSize=1',
    gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/labels',
  },
  results = await Promise.all(
    Object.entries(checks).map(async ([name, url]) => {
      const r = await fetch(url, { headers: { authorization: `Bearer ${token.access_token}` } });
      if (r.ok) {
        return `${name}: HTTP ${r.status}`;
      }
      const body = await r.json(),
        message = String(body.error?.message ?? '').slice(0, 300);
      return `${name}: HTTP ${r.status} ${message}`;
    }),
  );
console.log(results.join('\n'));
