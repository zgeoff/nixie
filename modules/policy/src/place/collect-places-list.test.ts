import { expect, test } from 'bun:test';
import type { PlacesListInput } from './collect-places-list';
import { collectPlacesList } from './collect-places-list';
import type { StoredPlace } from './read-places';
import type { PlaceKey, Trust } from './types';

interface FilterCase {
  readonly title: string;
  readonly input: PlacesListInput;
  readonly shown: string[];
}

function setupTest() {
  const builder = {
    build: (
      shortID: string,
      key: PlaceKey,
      trust: Trust,
      extra: Partial<StoredPlace> = {},
    ): StoredPlace => ({
      placeID: `id-${shortID}`,
      shortID,
      key,
      trust,
      name: null,
      addedBy: 'you',
      isRemoved: false,
      addedSequence: Number(shortID.slice(1)),
      lastUsedAt: null,
      ...extra,
    }),
  };

  const build = builder.build;

  return {
    build,
    places: [
      build('p1', { kind: 'site', domain: 'library.example.org', subdomains: true }, 'read', {
        name: 'The library',
      }),
      build('p2', { kind: 'site', domain: 'tickets.example.com', subdomains: false }, 'act'),
      build('p3', { kind: 'address', address: 'sam@example.org' }, 'known'),
      build('p4', { kind: 'site', domain: 'old.example.com', subdomains: false }, 'read', {
        isRemoved: true,
      }),
      build('p5', { kind: 'site', domain: 'news.example.net', subdomains: false }, 'read'),
    ],
  };
}

test('#collectPlacesList lists each live place with its short ID, in the order added', () => {
  const ctx = setupTest();

  expect(collectPlacesList(ctx.places, {})).toStrictEqual({
    status: 'ok',
    total: 4,
    nextAfter: null,
    places: [
      { place: 'p1', key: '*.library.example.org', trust: 'read', name: 'The library' },
      { place: 'p2', key: 'tickets.example.com', trust: 'act', name: null },
      { place: 'p3', key: 'sam@example.org', trust: 'known', name: null },
      { place: 'p5', key: 'news.example.net', trust: 'read', name: null },
    ],
  });
});

test.each<FilterCase>([
  { title: 'trust', input: { trust: 'read' }, shown: ['p1', 'p5'] },
  { title: 'kind', input: { kind: 'address' }, shown: ['p3'] },
  { title: 'query on the name, in any case', input: { query: 'LIBRARY' }, shown: ['p1'] },
  { title: 'query on the key', input: { query: 'tickets' }, shown: ['p2'] },
  { title: 'trust and kind together', input: { trust: 'read', kind: 'site' }, shown: ['p1', 'p5'] },
])('#collectPlacesList filters by $title', (row) => {
  const ctx = setupTest();
  const list = collectPlacesList(ctx.places, row.input);
  const shown = list.status === 'ok' ? list.places.map((entry) => entry.place) : null;

  expect(shown).toStrictEqual(row.shown);
});

test('#collectPlacesList returns only the entry that covers the place', () => {
  const ctx = setupTest();
  const list = collectPlacesList(ctx.places, { place: 'catalog.library.example.org' });

  expect(list).toMatchObject({ status: 'ok', total: 1, places: [{ place: 'p1' }] });
});

test('#collectPlacesList returns none for a place that no entry covers', () => {
  const ctx = setupTest();

  expect(collectPlacesList(ctx.places, { place: 'unknown.example.net' })).toStrictEqual({
    status: 'ok',
    total: 0,
    nextAfter: null,
    places: [],
  });
});

test('#collectPlacesList counts every match in total and pages with after', () => {
  const ctx = setupTest();
  const first = collectPlacesList(ctx.places, { limit: 3 });
  const second = collectPlacesList(ctx.places, { limit: 3, after: 'p3' });

  expect({
    first: first.status === 'ok' ? [first.total, first.nextAfter] : null,
    second: second.status === 'ok' ? [second.total, second.nextAfter, second.places.length] : null,
  }).toStrictEqual({ first: [4, 'p3'], second: [4, null, 1] });
});

test('#collectPlacesList adds who added a place and when it was last used on request', () => {
  const ctx = setupTest();

  const list = collectPlacesList(
    [ctx.build('p1', { kind: 'phone', e164: '+61420000000' }, 'act', { lastUsedAt: 0 })],
    { detail: true },
  );

  expect(list).toMatchObject({
    places: [{ addedBy: 'you', lastUsedAt: '1970-01-01T00:00:00.000Z' }],
  });
});

test('#collectPlacesList reports an after that no match holds', () => {
  const ctx = setupTest();

  expect(collectPlacesList(ctx.places, { after: 'zz' })).toStrictEqual({ status: 'unknown_after' });
});
