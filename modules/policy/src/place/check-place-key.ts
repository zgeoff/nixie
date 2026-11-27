import { isPublicSuffix } from './is-public-suffix';
import type { PlaceAddedBy, PlaceKey, Trust } from './types';

export type PlaceKeyFault = 'raw_key' | 'public_suffix' | 'trust_not_allowed';

// The faults every writer of an entry refuses: a key that names a whole public suffix with
// subdomains, a raw key that only a migrated contact holds, a mail domain at act, and a site or
// mail domain at self.
export function checkPlaceKey(
  key: PlaceKey,
  trust: Trust,
  addedBy: PlaceAddedBy,
): PlaceKeyFault | null {
  if (key.kind === 'raw') {
    return 'raw_key';
  }

  if (
    (key.kind === 'site' || key.kind === 'mail_domain') &&
    key.subdomains &&
    isPublicSuffix(key.domain)
  ) {
    return 'public_suffix';
  }

  if (key.kind === 'mail_domain' && (trust === 'act' || trust === 'self')) {
    return 'trust_not_allowed';
  }

  // nixie's own site is at act, but self holds only your own addresses, numbers and handles
  if (key.kind === 'site' && trust === 'self') {
    return 'trust_not_allowed';
  }

  return addedBy === 'seed' && isPersonalKey(key) ? 'trust_not_allowed' : null;
}

// An address, phone or handle place never comes from the definitions repo.
function isPersonalKey(key: PlaceKey): boolean {
  return key.kind === 'address' || key.kind === 'phone' || key.kind === 'handle';
}
