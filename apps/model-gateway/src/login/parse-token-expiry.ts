import { parseJWTClaims } from './parse-jwt-claims';

// the instant in milliseconds, or null when the token has no readable exp claim
export function parseTokenExpiry(jwt: string): number | null {
  const exp = parseJWTClaims(jwt)?.['exp'];

  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}
