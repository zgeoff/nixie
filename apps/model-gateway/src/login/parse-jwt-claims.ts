import { isRecord } from '../utils/is-record';

// The claims of a JWT, with no check of its signature: the gateway reads the account and the expiry
// from tokens it just got from the token endpoint over TLS.
export function parseJWTClaims(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split('.');

  if (payload === undefined) {
    return null;
  }

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    return isRecord(claims) ? claims : null;
  } catch {
    return null;
  }
}
