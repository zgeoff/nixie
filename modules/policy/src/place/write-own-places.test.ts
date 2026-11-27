import { expect, test } from 'bun:test';
import { startTestLog } from '@heynixie/log/test-utils';
import { placesProjection } from './places-projection';
import { readPlaces } from './read-places';
import { writeOwnPlaces } from './write-own-places';
import { writePlaceRemoved } from './write-place-removed';

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, placesProjection] };

  return {
    log,
    context: {
      log,
      definitions: () => ({ snapshotHash: 'snapshot-1' }),
      publishSnapshot: () => Promise.resolve(),
    },
  };
}

test('it adds each place that a source names at act as nixie own', async () => {
  const ctx = await setupTest();

  const added = await writeOwnPlaces(ctx.context, [
    {
      read: () =>
        Promise.resolve([
          { place: '+61 420 000 000', name: 'The phone' },
          { place: 'nixie.example.org', name: null },
        ]),
    },
  ]);

  const places = await readPlaces(ctx.log);

  expect({
    added,
    listed: places.map((place) => [place.key, place.trust, place.addedBy]),
  }).toStrictEqual({
    added: 2,
    listed: [
      [{ kind: 'phone', e164: '+61420000000' }, 'act', 'nixie_own'],
      [{ kind: 'site', domain: 'nixie.example.org', subdomains: false }, 'act', 'nixie_own'],
    ],
  });
});

test('it adds nothing for a source that names no place', async () => {
  const ctx = await setupTest();
  const added = await writeOwnPlaces(ctx.context, [{ read: () => Promise.resolve([]) }]);

  expect(added).toBe(0);
});

test('it leaves a value that you removed removed at the next start', async () => {
  const ctx = await setupTest();

  const sources = [{ read: () => Promise.resolve([{ place: '+61 420 000 000', name: null }]) }];

  await writeOwnPlaces(ctx.context, sources);

  const [place] = await readPlaces(ctx.log);

  await writePlaceRemoved(ctx.context, place?.placeID ?? '');

  const added = await writeOwnPlaces(ctx.context, sources);

  expect({ added, listed: await readPlaces(ctx.log) }).toStrictEqual({ added: 0, listed: [] });
});

test('it adds a value once when two starts name it', async () => {
  const ctx = await setupTest();

  const sources = [{ read: () => Promise.resolve([{ place: '+61 420 000 000', name: null }]) }];

  await writeOwnPlaces(ctx.context, sources);
  await writeOwnPlaces(ctx.context, sources);

  const places = await readPlaces(ctx.log);

  expect(places).toHaveLength(1);
});
