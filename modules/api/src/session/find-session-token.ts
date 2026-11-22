import { sessionCookieName } from '@heynixie/contract';
import type { APIRequestContext } from '../types';

// A server render forwards the browser's session as a bearer token, so the bearer token wins over
// the cookie.
export function findSessionToken(headers: Headers): APIRequestContext {
  const origin = headers.get('origin') ?? undefined;
  const bearer = /^Bearer (?<token>\S+)$/u.exec(headers.get('authorization') ?? '');

  if (bearer?.groups?.['token'] !== undefined) {
    return { sessionToken: bearer.groups['token'], tokenSource: 'bearer', origin };
  }

  for (const pair of (headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = pair.trim().split('=');

    if (name === sessionCookieName && value.length > 0) {
      return { sessionToken: value.join('='), tokenSource: 'cookie', origin };
    }
  }

  return { sessionToken: undefined, tokenSource: 'none', origin };
}
