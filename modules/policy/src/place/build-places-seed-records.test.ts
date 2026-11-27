import { expect, test } from 'bun:test';
import { buildPlacesSeedRecords } from './build-places-seed-records';

test('it writes a removal before each add, each with its IDs in the payload', () => {
  const records = buildPlacesSeedRecords(
    {
      adds: [
        {
          placeID: 'p2',
          shortID: 'k3p9m2x7qa',
          key: { kind: 'site', domain: 'library.example.org', subdomains: true },
          trust: 'read',
          name: 'The library',
        },
      ],
      removes: ['p1'],
    },
    { snapshotHash: 'snapshot-1' },
  );

  expect(records).toStrictEqual([
    {
      kind: 'places.removed',
      definitions: { snapshotHash: 'snapshot-1' },
      payload: { placeID: 'p1' },
    },
    {
      kind: 'places.added',
      definitions: { snapshotHash: 'snapshot-1' },
      payload: {
        placeID: 'p2',
        shortID: 'k3p9m2x7qa',
        kind: 'site',
        trust: 'read',
        addedBy: 'seed',
        domain: 'library.example.org',
        subdomains: true,
        name: 'The library',
      },
    },
  ]);
});
