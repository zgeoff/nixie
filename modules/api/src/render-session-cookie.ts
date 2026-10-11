import { sessionCookieName } from '@heynixie/contract';

// Host-only, with no Domain, so the cookie reaches only the host name the web client and the API
// share. Without Path=/ a cookie set from an /rpc response reaches only /rpc, and Start renders every
// page signed out. The server decides when a session lapses, so the cookie lives as long as it can.
export function renderSessionCookie(token: string | null): string {
  const maxAgeS = token === null ? 0 : MAX_AGE_S;

  return `${sessionCookieName}=${token ?? ''}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeS}`;
}

// 400 days, the longest a browser keeps a cookie
const MAX_AGE_S = 400 * 24 * 60 * 60;
