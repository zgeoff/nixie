import { sessionCookieName } from './session-cookie-name';

// Browsers cap a cookie's lifetime at 400 days.
const MAX_AGE_S = 400 * 24 * 60 * 60;

// The browser sends a Strict cookie on no navigation from outside the site, which includes a launch
// from the installed app's icon, so the cookie is Lax.
export function renderSessionCookie(token: string | null): string {
  const maxAgeS = token === null ? 0 : MAX_AGE_S;

  return `${sessionCookieName}=${token ?? ''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}
