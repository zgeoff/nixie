import { timingSafeEqual } from 'node:crypto';

export function isToolsRequestAuthorized(authorization: string | null, token: string): boolean {
  const presented = Buffer.from(authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);

  return token !== '' && presented.length === expected.length && timingSafeEqual(presented, expected);
}
