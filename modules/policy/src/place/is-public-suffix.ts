import { parse } from 'tldts';

// A name that the public-suffix list holds, in its ICANN or its private section, such as org, co.uk
// or github.io. A name the list does not hold, such as localhost, and an IP address are no suffix.
export function isPublicSuffix(domain: string): boolean {
  const parsed = parse(domain, { allowPrivateDomains: true });
  const isListed = parsed.isIcann === true || parsed.isPrivate === true;

  return isListed && parsed.publicSuffix === domain && parsed.domain === null;
}
