import { expect, test } from 'bun:test';
import { buildPlaceOffer } from './build-place-offer';

interface NoOfferCase {
  readonly title: string;
  readonly destinations: readonly string[];
}

test('#buildPlaceOffer gives the exact site key of one host named twice', () => {
  expect(
    buildPlaceOffer(['https://Tickets.example.com/a', 'tickets.example.com:8443']),
  ).toStrictEqual({ kind: 'site', domain: 'tickets.example.com', subdomains: false });
});

test('#buildPlaceOffer gives the key of one address', () => {
  expect(buildPlaceOffer(['Sam@Example.org'])).toStrictEqual({
    kind: 'address',
    address: 'sam@example.org',
  });
});

test.each<NoOfferCase>([
  { title: 'no destination', destinations: [] },
  { title: 'two sites', destinations: ['a.example.org', 'b.example.org'] },
  { title: 'a site and an address', destinations: ['a.example.org', 'sam@a.example.org'] },
  { title: 'a destination that is no place', destinations: ['not a place'] },
])('#buildPlaceOffer gives no offer for $title', (row) => {
  expect(buildPlaceOffer(row.destinations)).toBeNull();
});
