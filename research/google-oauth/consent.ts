// Runs the OAuth consent once with a loopback redirect and PKCE, stores the refresh token in the
// nixie vault, and checks one call per API. Prints no secret.
// A throwaway script reads top to bottom, and its steps depend on each other in order.
import { $ } from 'bun';

const scopes = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
];
const port = 8765;
const redirectURI = `http://127.0.0.1:${port}/callback`;
const clientJSON = await $`op read op://nixie/google-oauth-client/google-oauth-client.json`.text();
const client = JSON.parse(clientJSON).installed;
const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url');
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
const challenge = Buffer.from(digest).toString('base64url');
const state = crypto.randomUUID();
const authURL = new URL('https://accounts.google.com/o/oauth2/v2/auth');

authURL.search = new URLSearchParams({
  access_type: 'offline',
  client_id: client.client_id,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  prompt: 'consent',
  redirect_uri: redirectURI,
  response_type: 'code',
  scope: scopes.join(' '),
  state,
}).toString();

console.log(`Open this URL in your browser:\n\n${authURL}\n`);

const callback = Promise.withResolvers<string>();
const server = Bun.serve({
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== '/callback') {
      return new Response('not found', { status: 404 });
    }
    const error = url.searchParams.get('error');
    const received = url.searchParams.get('code');
    setTimeout(() => server.stop(), 100);
    if (error || url.searchParams.get('state') !== state || !received) {
      callback.reject(new Error(`consent failed: ${error ?? 'state mismatch or no code'}`));
      return new Response('Consent failed. You can close this tab.');
    }
    callback.resolve(received);
    return new Response('Consent received. You can close this tab.');
  },
  hostname: '127.0.0.1',
  port,
});
const code = await callback.promise;
const tokenRes = await fetch(client.token_uri, {
  body: new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectURI,
  }),
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  method: 'POST',
});
const token = await tokenRes.json();

if (!tokenRes.ok || !token.refresh_token) {
  throw new Error(`token exchange failed: ${tokenRes.status} ${token.error ?? 'no refresh token'}`);
}

const consentedAt = new Date().toISOString();
await $`op item create --vault nixie --category "API Credential" --title google-refresh-token credential=${token.refresh_token} consented_at=${consentedAt} scopes=${token.scope}`.quiet();
console.log(`stored the refresh token at ${consentedAt}`);
console.log(`granted scopes: ${token.scope}`);

const checks = {
  calendar: 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1',
  drive: 'https://www.googleapis.com/drive/v3/files?pageSize=1',
  gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/labels',
};
const results = await Promise.all(
  Object.entries(checks).map(async ([name, url]) => {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token.access_token}` } });
    return `${name}: HTTP ${res.status}`;
  }),
);
console.log(results.join('\n'));
