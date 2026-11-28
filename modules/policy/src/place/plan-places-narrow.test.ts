import { expect, test } from 'bun:test';
import type { NarrowPlan, NarrowRequest } from './plan-places-narrow';
import { planPlacesNarrow } from './plan-places-narrow';
import type { PlaceEntry } from './types';

// placeID, domain, trust, subdomains
type SiteRow = readonly [string, string, PlaceEntry['trust'], boolean];

interface NarrowCase {
  readonly title: string;
  readonly sites: readonly SiteRow[];
  readonly target: string;
  readonly request: NarrowRequest;
  readonly expected: NarrowPlan;
}

function setupTest() {
  return {
    build: (sites: readonly SiteRow[]): PlaceEntry[] =>
      sites.map(([placeID, domain, trust, subdomains]) => ({
        placeID,
        shortID: placeID,
        key: { kind: 'site', domain, subdomains },
        trust,
      })),
  };
}

test.each<NarrowCase>([
  {
    title: 'lowers act to read',
    sites: [['a', 'tickets.example.com', 'act', false]],
    target: 'a',
    request: { kind: 'lower', trust: 'read' },
    expected: { status: 'ok' },
  },
  {
    title: 'lowers read to blocked',
    sites: [['a', 'tickets.example.com', 'read', false]],
    target: 'a',
    request: { kind: 'lower', trust: 'blocked' },
    expected: { status: 'ok' },
  },
  {
    title: 'removes an entry at act',
    sites: [['a', 'tickets.example.com', 'act', false]],
    target: 'a',
    request: { kind: 'remove' },
    expected: { status: 'ok' },
  },
  {
    title: 'refuses the same level',
    sites: [['a', 'tickets.example.com', 'read', false]],
    target: 'a',
    request: { kind: 'lower', trust: 'read' },
    expected: { status: 'refused', reason: 'not_lower' },
  },
  {
    title: 'refuses a higher level',
    sites: [['a', 'tickets.example.com', 'known', false]],
    target: 'a',
    request: { kind: 'lower', trust: 'read' },
    expected: { status: 'refused', reason: 'not_lower' },
  },
  {
    title: 'refuses to remove a blocked entry',
    sites: [['a', 'tickets.example.com', 'blocked', false]],
    target: 'a',
    request: { kind: 'remove' },
    expected: { status: 'refused', reason: 'blocked_remove' },
  },
  {
    title: 'refuses an entry that no place holds',
    sites: [['b', 'tickets.example.com', 'read', false]],
    target: 'a',
    request: { kind: 'lower', trust: 'known' },
    expected: { status: 'refused', reason: 'not_found' },
  },
  {
    title: 'lowers a site that sits under a wildcard at a higher level',
    sites: [
      ['a', 'forms.example.org', 'read', false],
      ['w', 'example.org', 'act', true],
    ],
    target: 'a',
    request: { kind: 'lower', trust: 'known' },
    expected: { status: 'ok' },
  },
  {
    title: 'lowers the wildcard that covers a site another entry holds lower',
    sites: [
      ['a', 'forms.example.org', 'read', false],
      ['w', 'example.org', 'act', true],
    ],
    target: 'w',
    request: { kind: 'lower', trust: 'read' },
    expected: { status: 'ok' },
  },
  {
    title: 'refuses a remove that leaves a site at the wildcard level above',
    sites: [
      ['a', 'forms.example.org', 'known', false],
      ['w', 'example.org', 'act', true],
    ],
    target: 'a',
    request: { kind: 'remove' },
    expected: { status: 'refused', reason: 'raises_destination' },
  },
  {
    title: 'refuses a remove of the bare domain that a wildcard at act covers',
    sites: [
      ['w', 'example.org', 'act', true],
      ['x', 'example.org', 'read', false],
    ],
    target: 'x',
    request: { kind: 'remove' },
    expected: { status: 'refused', reason: 'raises_destination' },
  },
])('#planPlacesNarrow $title', (row) => {
  const ctx = setupTest();

  expect(planPlacesNarrow(ctx.build(row.sites), row.target, row.request)).toStrictEqual(
    row.expected,
  );
});

test('#planPlacesNarrow refuses a remove of an address that leaves it at its mail domain level', () => {
  const entries: PlaceEntry[] = [
    {
      placeID: 'a',
      shortID: 'a',
      key: { kind: 'address', address: 'sam@example.org' },
      trust: 'known',
    },
    {
      placeID: 'm',
      shortID: 'm',
      key: { kind: 'mail_domain', domain: 'example.org', subdomains: false },
      trust: 'read',
    },
  ];

  expect(planPlacesNarrow(entries, 'a', { kind: 'remove' })).toStrictEqual({
    status: 'refused',
    reason: 'raises_destination',
  });
});

test('#planPlacesNarrow refuses an entry at self', () => {
  const entries: PlaceEntry[] = [
    {
      placeID: 'a',
      shortID: 'a',
      key: { kind: 'address', address: 'me@example.org' },
      trust: 'self',
    },
  ];

  expect(planPlacesNarrow(entries, 'a', { kind: 'lower', trust: 'known' })).toStrictEqual({
    status: 'refused',
    reason: 'self_entry',
  });
});

test('#planPlacesNarrow refuses a remove that raises a mail address when a blocked address sits on the usual sample', () => {
  const entries: PlaceEntry[] = [
    {
      placeID: 'w',
      shortID: 'w',
      key: { kind: 'mail_domain', domain: 'example.org', subdomains: true },
      trust: 'read',
    },
    {
      placeID: 's',
      shortID: 's',
      key: { kind: 'mail_domain', domain: 'shop.example.org', subdomains: false },
      trust: 'known',
    },
    {
      placeID: 'b',
      shortID: 'b',
      key: { kind: 'address', address: 'nixie-sample@shop.example.org' },
      trust: 'blocked',
    },
  ];

  expect(planPlacesNarrow(entries, 's', { kind: 'remove' })).toStrictEqual({
    status: 'refused',
    reason: 'raises_destination',
  });
});

test('#planPlacesNarrow refuses a remove that raises a site when a blocked raw entry sits on its domain', () => {
  const entries: PlaceEntry[] = [
    {
      placeID: 'w',
      shortID: 'w',
      key: { kind: 'site', domain: 'example.org', subdomains: true },
      trust: 'read',
    },
    {
      placeID: 's',
      shortID: 's',
      key: { kind: 'site', domain: 'shop.example.org', subdomains: false },
      trust: 'known',
    },
    {
      placeID: 'c',
      shortID: 'c',
      key: { kind: 'raw', value: 'shop.example.org' },
      trust: 'blocked',
    },
  ];

  expect(planPlacesNarrow(entries, 's', { kind: 'remove' })).toStrictEqual({
    status: 'refused',
    reason: 'raises_destination',
  });
});
