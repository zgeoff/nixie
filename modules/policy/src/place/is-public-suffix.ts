import { parse } from 'tldts';

// A name on the public-suffix list, in its ICANN or its private section, such as org, co.uk or
// github.io. An IP address is no suffix.
export function isPublicSuffix(domain: string): boolean {
  const parsed = parse(domain, { allowPrivateDomains: true });

  return !parsed.isIp && parsed.publicSuffix === domain && parsed.domain === null;
}
