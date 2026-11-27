import { isPublicSuffix } from './is-public-suffix';
import { parsePlace } from './parse-place';
import type { PlaceKey } from './types';

// Reads a place key from text that you or nixie write: `*.host` covers subdomains, `@domain` names a
// mail domain. Returns null for a key on a whole public suffix, and for a site that starts with www.
export function parsePlacePattern(text: string): PlaceKey | null {
  const trimmed = text.normalize('NFC').trim();

  if (trimmed.startsWith('@')) {
    return parseMailDomain(trimmed.slice(1));
  }

  if (trimmed.startsWith('*.')) {
    const parsed = parsePlace(trimmed.slice(2));

    return parsed?.kind === 'site' ? toSiteKey(parsed.domain, true) : null;
  }

  const parsed = parsePlace(trimmed);

  if (parsed === null) {
    return null;
  }

  return parsed.kind === 'site' ? toSiteKey(parsed.domain, false) : parsed;
}

function parseMailDomain(text: string): PlaceKey | null {
  const subdomains = text.startsWith('*.');
  const domain = (subdomains ? text.slice(2) : text).toLowerCase().replace(/\.$/u, '');

  if (!/^[^\s/@:*]+$/u.test(domain) || (subdomains && isPublicSuffix(domain))) {
    return null;
  }

  return { kind: 'mail_domain', domain, subdomains };
}

function toSiteKey(domain: string, subdomains: boolean): PlaceKey | null {
  if (domain.startsWith('www.') || (subdomains && isPublicSuffix(domain))) {
    return null;
  }

  return { kind: 'site', domain, subdomains };
}
