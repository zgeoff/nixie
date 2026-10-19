import { sessionCookieName } from './session-cookie-name';

// 400 days, the longest a browser keeps a cookie
const MAX_AGE_S = 400 * 24 * 60 * 60;

// Host-only with Path=/, so Start's page renders and /rpc both get it; Lax, not Strict, so a launch
// from the installed app's icon, a navigation from outside the site, still sends it (the API doc in
// channels gives both reasons). The server decides when a session lapses, so the cookie lives long.
export function renderSessionCookie(token: string | null): string {
  const maxAgeS = token === null ? 0 : MAX_AGE_S;

  return `${sessionCookieName}=${token ?? ''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}
