import { expect, test } from 'bun:test';
import { buildShortIDFromUUID } from '@heynixie/db';
import { readRecords, runProjectionRebuild } from '@heynixie/log';
import { removeTestRecordKey, startTestLog } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { knownContactsProjection } from '../contact/known-contacts-projection';
import { writeContactMarked } from '../contact/write-contact-marked';
import { writeContactUnmarked } from '../contact/write-contact-unmarked';
import { placesProjection } from './places-projection';
import { readPlaceRefs } from './read-place-refs';
import { readPlaces } from './read-places';
import { writePlaceAdded } from './write-place-added';
import { writePlaceChanged } from './write-place-changed';
import { writePlaceRemoved } from './write-place-removed';

async function setupTest() {
  const started = await startTestLog();

  const log = {
    ...started.log,
    projections: [...started.log.projections, knownContactsProjection, placesProjection],
  };

  const published = { count: 0 };

  return {
    log,
    published,
    context: {
      log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
      runInForce: () => {
        published.count += 1;

        return Promise.resolve();
      },
    },
    refusingContext: {
      log,
      clock: started.clock,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
      runInForce: () => Promise.reject(new Error('the seed was refused')),
    },
  };
}

test('it keeps the key and the name of a site place in the projection', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'library.example.org', subdomains: true },
    trust: 'read',
    name: 'The library',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const listed = await readPlaces(ctx.log);

  expect(listed).toStrictEqual([
    {
      placeID: added.placeID,
      shortID: added.shortID,
      key: { kind: 'site', domain: 'library.example.org', subdomains: true },
      trust: 'read',
      name: 'The library',
      addedBy: 'you',
      isRemoved: false,
      addedSequence: expect.toBeNumber(),
      lastUsedAt: null,
    },
  ]);
});

test('it keeps the key and the name of an address place in the erasable fields only', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'act',
    name: 'Sam',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const [entry] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['places.added'] });
  const places = await readPlaces(ctx.log);

  expect({
    payload: entry?.record.payload,
    listed: places.map((place) => [place.key, place.name]),
  }).toStrictEqual({
    payload: {
      placeID: added.placeID,
      shortID: added.shortID,
      kind: 'address',
      trust: 'act',
      addedBy: 'you',
    },
    listed: [[{ kind: 'address', address: 'sam@example.org' }, 'Sam']],
  });
});

test('it refuses a second entry for a key that an entry already holds', async () => {
  const ctx = await setupTest();

  const key = { kind: 'site', domain: 'library.example.org', subdomains: false } as const;

  await writePlaceAdded(ctx.context, { key, trust: 'read', name: null, addedBy: 'you' });

  const second = await writePlaceAdded(ctx.context, {
    key,
    trust: 'blocked',
    name: null,
    addedBy: 'you',
  });

  expect(second).toStrictEqual({ status: 'refused', fault: 'key_held' });
});

test('it refuses a key that a known contact already holds', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: 'Sam' });

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'act',
    name: null,
    addedBy: 'you',
  });

  expect(added).toStrictEqual({ status: 'refused', fault: 'key_held' });
});

test('it allows a second entry for a key whose first entry was removed', async () => {
  const ctx = await setupTest();

  const key = { kind: 'site', domain: 'library.example.org', subdomains: false } as const;

  const first = await writePlaceAdded(ctx.context, {
    key,
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  invariant(first.status === 'added');

  await writePlaceRemoved(ctx.context, first.placeID);

  const second = await writePlaceAdded(ctx.context, {
    key,
    trust: 'blocked',
    name: null,
    addedBy: 'you',
  });

  expect(second.status).toBe('added');
});

test.each([
  [
    'subdomains on a whole public suffix',
    { kind: 'site', domain: 'github.io', subdomains: true },
    'read',
    'public_suffix',
  ],
  [
    'mail subdomains on a whole public suffix',
    { kind: 'mail_domain', domain: 'co.uk', subdomains: true },
    'known',
    'public_suffix',
  ],
  [
    'a mail domain at act',
    { kind: 'mail_domain', domain: 'example.org', subdomains: false },
    'act',
    'trust_not_allowed',
  ],
  [
    'a site at self',
    { kind: 'site', domain: 'example.org', subdomains: false },
    'self',
    'trust_not_allowed',
  ],
  ['a raw key', { kind: 'raw', value: 'owner/skills' }, 'known', 'raw_key'],
] as const)('it refuses %s', async (_title, key, trust, fault) => {
  const ctx = await setupTest();
  const added = await writePlaceAdded(ctx.context, { key, trust, name: null, addedBy: 'you' });

  expect(added).toStrictEqual({ status: 'refused', fault });
});

test('it allows an exact key on a public suffix', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'github.io', subdomains: false },
    trust: 'blocked',
    name: null,
    addedBy: 'you',
  });

  expect(added.status).toBe('added');
});

test('it changes the level and the name of an address place', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'known',
    name: 'Sam',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const changed = await writePlaceChanged(ctx.context, {
    placeID: added.placeID,
    trust: 'act',
    name: 'Samira',
  });

  const listedNow = await readPlaces(ctx.log);

  expect({
    changed,
    listed: listedNow.map((place) => [place.trust, place.name]),
  }).toStrictEqual({ changed: { status: 'changed', trust: 'act' }, listed: [['act', 'Samira']] });
});

test('it keeps the name of an address place when a change names only a level', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'known',
    name: 'Sam',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceChanged(ctx.context, { placeID: added.placeID, trust: 'blocked' });

  const listedAfter = await readPlaces(ctx.log);

  expect(listedAfter.map((place) => [place.trust, place.name])).toStrictEqual([['blocked', 'Sam']]);
});

test('it refuses to raise a mail domain to act and reports no change for an unknown ID', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'mail_domain', domain: 'example.org', subdomains: false },
    trust: 'known',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  expect([
    await writePlaceChanged(ctx.context, { placeID: added.placeID, trust: 'act' }),
    await writePlaceChanged(ctx.context, { placeID: crypto.randomUUID(), trust: 'read' }),
  ]).toStrictEqual([{ status: 'refused', fault: 'trust_not_allowed' }, { status: 'not_found' }]);
});

test('it keeps a removed place for a replay, and leaves it out of the current list', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'library.example.org', subdomains: false },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const isRemoved = await writePlaceRemoved(ctx.context, added.placeID);
  const current = await readPlaces(ctx.log);
  const replayed = await readPlaces(ctx.log, { placeIDs: [added.placeID] });

  expect({
    isRemoved,
    current,
    replayed: replayed.map((place) => place.isRemoved),
    refs: await readPlaceRefs(ctx.log.writer.db),
  }).toStrictEqual({ isRemoved: true, current: [], replayed: [true], refs: [] });
});

test('it keeps the ID of a removed address place in the erasable fields, and leaves the place removed after a rebuild', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'act',
    name: 'Sam',
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceRemoved(ctx.context, added.placeID);

  const listed = await readPlaces(ctx.log);

  await runProjectionRebuild(ctx.log);

  const [removal] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['places.removed'] });

  expect({
    listed,
    rebuilt: await readPlaces(ctx.log),
    payload: removal?.record.payload,
    erasable: removal?.record.erasable,
  }).toStrictEqual({
    listed: [],
    rebuilt: [],
    payload: {},
    erasable: { status: 'readable', fields: { placeID: added.placeID } },
  });
});

test('it leaves a removed site place removed after a rebuild', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'tickets.example.com', subdomains: false },
    trust: 'act',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceRemoved(ctx.context, added.placeID);
  await runProjectionRebuild(ctx.log);

  const rebuilt = await readPlaces(ctx.log);

  expect(rebuilt).toStrictEqual([]);
});

test('it covers nothing once the key of an address place is gone', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'blocked',
    name: 'Sam',
    addedBy: 'you',
  });

  const [entry] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['places.added'] });

  invariant(entry);

  await removeTestRecordKey(ctx.log, entry.record.sequence);

  const listedAfter = await readPlaces(ctx.log);

  expect(listedAfter).toStrictEqual([]);
});

test('it folds a known contact into a place at known with the short ID its contact ID gives', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'Sam@Example.org',
    name: 'Sam',
  });

  const places = await readPlaces(ctx.log);

  expect(places).toStrictEqual([
    {
      placeID: marked.contact.contactID,
      shortID: buildShortIDFromUUID(marked.contact.contactID),
      key: { kind: 'address', address: 'sam@example.org' },
      trust: 'known',
      name: 'Sam',
      addedBy: 'you',
      isRemoved: false,
      addedSequence: expect.toBeNumber(),
      lastUsedAt: null,
    },
  ]);
});

test('it gives a contact that is no address, number or handle a raw key of its exact string', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'owner/skills', name: null });
  await writeContactMarked(ctx.context, { destination: 'example.org', name: null });

  const listedKeys = await readPlaces(ctx.log);

  expect(listedKeys.map((place) => place.key)).toStrictEqual([
    { kind: 'raw', value: 'owner/skills' },
    { kind: 'raw', value: 'example.org' },
  ]);
});

test('it gives a contact a raw key when a place already holds its key', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, {
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'act',
    name: null,
    addedBy: 'you',
  });

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: null });

  const listedPairs = await readPlaces(ctx.log);

  expect(listedPairs.map((place) => [place.trust, place.key])).toStrictEqual([
    ['act', { kind: 'address', address: 'sam@example.org' }],
    ['known', { kind: 'raw', value: 'sam@example.org' }],
  ]);
});

test('it lists the new name of a contact you renamed', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: 'Sam',
  });

  await writePlaceChanged(ctx.context, { placeID: marked.contact.contactID, name: 'Sam at work' });

  const listedNames = await readPlaces(ctx.log);

  expect(listedNames.map((place) => place.name)).toStrictEqual(['Sam at work']);
});

test('it keeps the new name of a contact with a raw key in the erasable fields only', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'owner/skills',
    name: 'Sam',
  });

  await writePlaceChanged(ctx.context, { placeID: marked.contact.contactID, name: 'Sam at work' });

  const [changed] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['places.changed'] });

  expect([changed?.record.payload, changed?.record.erasable]).toStrictEqual([
    { placeID: marked.contact.contactID },
    { status: 'readable', fields: { name: 'Sam at work' } },
  ]);
});

test('it removes the place of a contact that is unmarked', async () => {
  const ctx = await setupTest();

  const marked = await writeContactMarked(ctx.context, {
    destination: 'sam@example.org',
    name: null,
  });

  await writeContactUnmarked(ctx.context, marked.contact.contactID);

  const refs = await readPlaceRefs(ctx.log.writer.db);

  expect(refs).toStrictEqual([]);
});

test('it lists each place of a snapshot with its level, sorted by ID', async () => {
  const ctx = await setupTest();

  const first = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'a.example.org', subdomains: false },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  const second = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'b.example.org', subdomains: false },
    trust: 'blocked',
    name: null,
    addedBy: 'you',
  });

  invariant(first.status === 'added' && second.status === 'added');

  const refs = await readPlaceRefs(ctx.log.writer.db);

  expect(refs.map((ref) => ref.placeID)).toStrictEqual([first.placeID, second.placeID].toSorted());
});

test('it publishes one snapshot for each add, change and removal that took effect', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'a.example.org', subdomains: false },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  await writePlaceChanged(ctx.context, { placeID: added.placeID, trust: 'blocked' });
  await writePlaceRemoved(ctx.context, added.placeID);

  expect(ctx.published.count).toBe(3);
});

test('it publishes no snapshot for an add, a change and a removal that took no effect', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'github.io', subdomains: true },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  await writePlaceChanged(ctx.context, { placeID: 'no-such-place', trust: 'read' });
  await writePlaceRemoved(ctx.context, 'no-such-place');

  expect(ctx.published.count).toBe(0);
});

test('it leaves no place when the seed refuses an add', async () => {
  const ctx = await setupTest();

  const add = writePlaceAdded(ctx.refusingContext, {
    key: { kind: 'site', domain: 'a.example.org', subdomains: false },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  const settled = await Promise.allSettled([add]);
  const places = await readPlaces(ctx.log, { isRemovedIncluded: true });

  expect(settled.map((outcome) => outcome.status)).toStrictEqual(['rejected']);
  expect(places).toStrictEqual([]);
});

test('it keeps the level of a place when the seed refuses a change', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'a.example.org', subdomains: false },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const settled = await Promise.allSettled([
    writePlaceChanged(ctx.refusingContext, { placeID: added.placeID, trust: 'blocked' }),
  ]);

  const places = await readPlaces(ctx.log);

  expect(settled.map((outcome) => outcome.status)).toStrictEqual(['rejected']);
  expect(places.map((place) => place.trust)).toStrictEqual(['read']);
});

test('it keeps a place when the seed refuses its removal', async () => {
  const ctx = await setupTest();

  const added = await writePlaceAdded(ctx.context, {
    key: { kind: 'site', domain: 'a.example.org', subdomains: false },
    trust: 'read',
    name: null,
    addedBy: 'you',
  });

  invariant(added.status === 'added');

  const settled = await Promise.allSettled([writePlaceRemoved(ctx.refusingContext, added.placeID)]);
  const places = await readPlaces(ctx.log);

  expect(settled.map((outcome) => outcome.status)).toStrictEqual(['rejected']);
  expect(places.map((place) => place.placeID)).toStrictEqual([added.placeID]);
});
