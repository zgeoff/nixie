import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { knownContactsProjection } from '../contact/known-contacts-projection';
import { writeContactMarked } from '../contact/write-contact-marked';
import { findPlace } from './find-place';
import { isPlaceAllowing } from './is-place-allowing';
import { parsePlace } from './parse-place';
import { placesProjection } from './places-projection';
import { readPlaces } from './read-places';
import type { PlaceKey } from './types';
import { writePlaceAdded } from './write-place-added';
import { writePlaceTrustedInTransaction } from './write-place-trusted-in-transaction';

async function setupTest() {
  const started = await startTestLog();

  const log = {
    ...started.log,
    projections: [...started.log.projections, knownContactsProjection, placesProjection],
  };

  const seeds: string[] = [];

  const context = {
    log,
    clock: started.clock,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    runInForce: () => {
      seeds.push('in force');

      return Promise.resolve();
    },
  };

  return {
    context,
    seeds,
    site: { kind: 'site', domain: 'tickets.example.com', subdomains: false } satisfies PlaceKey,
    trust: (request: Parameters<typeof writePlaceTrustedInTransaction>[2]) =>
      withWriteTransaction(log.writer, (tx) =>
        writePlaceTrustedInTransaction(tx, context, request),
      ),
    readAllowed: async (destination: string) => {
      const places = await readPlaces(log);

      const live = places.filter((place) => !place.isRemoved);
      const found = findPlace(live, { parsed: parsePlace(destination), raw: destination });

      return found !== null && isPlaceAllowing(found.trust, ['fetch']);
    },
  };
}

test('it adds the entry for a place that has none, and puts the snapshot in force', async () => {
  const ctx = await setupTest();

  const result = await ctx.trust({
    key: ctx.site,
    trust: 'read',
    addedBy: 'card',
    isUnblocking: false,
  });

  const places = await readPlaces(ctx.context.log);

  expect({
    result,
    listed: places.map((place) => [place.key, place.trust, place.addedBy]),
    seeds: ctx.seeds,
  }).toStrictEqual({
    result: { status: 'added' },
    listed: [[ctx.site, 'read', 'card']],
    seeds: ['in force'],
  });
});

test('it lets the next read of the place through once the entry is added', async () => {
  const ctx = await setupTest();

  await ctx.trust({ key: ctx.site, trust: 'read', addedBy: 'card', isUnblocking: false });

  const isAllowed = await ctx.readAllowed('https://tickets.example.com/open');

  expect(isAllowed).toBe(true);
});

test('it raises an entry at read to act', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, { key: ctx.site, trust: 'read', name: null, addedBy: 'you' });

  const result = await ctx.trust({
    key: ctx.site,
    trust: 'act',
    addedBy: 'card',
    isUnblocking: false,
  });

  const places = await readPlaces(ctx.context.log);

  expect({ result, levels: places.map((place) => place.trust) }).toStrictEqual({
    result: { status: 'raised' },
    levels: ['act'],
  });
});

test('it raises the entry that a marked contact holds at known', async () => {
  const ctx = await setupTest();

  await writeContactMarked(ctx.context, { destination: 'sam@example.org', name: 'Sam' });

  const result = await ctx.trust({
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'read',
    addedBy: 'card',
    isUnblocking: false,
  });

  const places = await readPlaces(ctx.context.log);

  expect({
    result,
    listed: places.map((place) => [place.key, place.trust, place.name]),
  }).toStrictEqual({
    result: { status: 'raised' },
    listed: [[{ kind: 'address', address: 'sam@example.org' }, 'read', 'Sam']],
  });
});

test('it never lowers an entry at act', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, { key: ctx.site, trust: 'act', name: null, addedBy: 'you' });

  const result = await ctx.trust({
    key: ctx.site,
    trust: 'read',
    addedBy: 'card',
    isUnblocking: false,
  });

  const places = await readPlaces(ctx.context.log);

  expect({ result, levels: places.map((place) => place.trust) }).toStrictEqual({
    result: { status: 'unchanged' },
    levels: ['act'],
  });
});

test('it leaves a blocked entry blocked when the answer does not unblock', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, {
    key: ctx.site,
    trust: 'blocked',
    name: null,
    addedBy: 'you',
  });

  const result = await ctx.trust({
    key: ctx.site,
    trust: 'read',
    addedBy: 'card',
    isUnblocking: false,
  });

  const places = await readPlaces(ctx.context.log);

  expect({ result, levels: places.map((place) => place.trust) }).toStrictEqual({
    result: { status: 'blocked' },
    levels: ['blocked'],
  });
});

test('it lifts a block when the answer unblocks', async () => {
  const ctx = await setupTest();

  await writePlaceAdded(ctx.context, {
    key: ctx.site,
    trust: 'blocked',
    name: null,
    addedBy: 'you',
  });

  const result = await ctx.trust({
    key: ctx.site,
    trust: 'read',
    addedBy: 'proposal',
    isUnblocking: true,
  });

  const places = await readPlaces(ctx.context.log);

  expect({ result, levels: places.map((place) => place.trust) }).toStrictEqual({
    result: { status: 'raised' },
    levels: ['read'],
  });
});
