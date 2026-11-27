import { match } from 'ts-pattern';
import type { PlaceKey } from './types';

// The key in the syntax parsePlacePattern reads, so a key that a list shows reads back unchanged.
export function formatPlaceKey(key: PlaceKey): string {
  return match(key)
    .with({ kind: 'site' }, (site) => (site.subdomains ? `*.${site.domain}` : site.domain))
    .with({ kind: 'mail_domain' }, (mail) =>
      mail.subdomains ? `@*.${mail.domain}` : `@${mail.domain}`,
    )
    .with({ kind: 'address' }, (entry) => entry.address)
    .with({ kind: 'phone' }, (entry) => entry.e164)
    .with({ kind: 'handle' }, (entry) => `${entry.channel}:${entry.id}`)
    .with({ kind: 'raw' }, (entry) => entry.value)
    .exhaustive();
}
