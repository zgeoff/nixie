import { match } from 'ts-pattern';
import type { PlaceKey } from './types';

// A place key in the words a card shows: "library.example.org and every subdomain".
export function formatPlaceWords(key: PlaceKey): string {
  return match(key)
    .with({ kind: 'site' }, (site) =>
      site.subdomains ? `${site.domain} and every subdomain` : site.domain,
    )
    .with({ kind: 'mail_domain' }, (mail) =>
      mail.subdomains
        ? `every address at ${mail.domain} and its subdomains`
        : `every address at ${mail.domain}`,
    )
    .with({ kind: 'address' }, (entry) => entry.address)
    .with({ kind: 'phone' }, (entry) => entry.e164)
    .with({ kind: 'handle' }, (entry) => `${entry.channel} ${entry.id}`)
    .with({ kind: 'raw' }, (entry) => entry.value)
    .exhaustive();
}
