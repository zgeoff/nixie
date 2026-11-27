import { match } from 'ts-pattern';
import type { DestinationText, PlaceKey } from './types';

// Whether an entry's key covers a destination. A raw key matches a declared string that equals its
// value, whatever parsed holds. A null parsed destination matches only a raw key.
export function isPlaceCovered(key: PlaceKey, destination: DestinationText): boolean {
  const parsed = destination.parsed;

  if (key.kind === 'raw') {
    return key.value === destination.raw;
  }

  if (parsed === null) {
    return false;
  }

  return match(key)
    .with(
      { kind: 'site' },
      (site) => parsed.kind === 'site' && isDomainCovered(site, parsed.domain),
    )
    .with(
      { kind: 'mail_domain' },
      (mail) => parsed.kind === 'address' && isDomainCovered(mail, getMailDomain(parsed.address)),
    )
    .with(
      { kind: 'address' },
      (entry) => parsed.kind === 'address' && parsed.address === entry.address,
    )
    .with({ kind: 'phone' }, (entry) => parsed.kind === 'phone' && parsed.e164 === entry.e164)
    .with(
      { kind: 'handle' },
      (entry) =>
        parsed.kind === 'handle' && parsed.channel === entry.channel && parsed.id === entry.id,
    )
    .exhaustive();
}

interface DomainKey {
  readonly domain: string;
  readonly subdomains: boolean;
}

function isDomainCovered(key: DomainKey, domain: string): boolean {
  return domain === key.domain || (key.subdomains && domain.endsWith(`.${key.domain}`));
}

function getMailDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}
