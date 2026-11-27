import { expect, test } from 'bun:test';
import { startTestLog } from '@heynixie/log/test-utils';
import { placesProjection, writePlaceAdded } from '@heynixie/policy';
import invariant from 'tiny-invariant';
import { makeBlockedPlaceFinder } from './make-blocked-place-finder';

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, placesProjection] };

  return {
    findBlockedPlace: makeBlockedPlaceFinder(log),
    addPlace: (domain: string, trust: 'blocked' | 'read') =>
      writePlaceAdded(
        { log, definitions: () => ({ snapshotHash: 'snapshot-1' }) },
        { key: { kind: 'site', domain, subdomains: true }, trust, name: null, addedBy: 'you' },
      ),
  };
}

test('it finds the short ID of a blocked site for a URL of one of its subdomains', async () => {
  const ctx = await setupTest();
  const added = await ctx.addPlace('tracker.example.org', 'blocked');

  invariant(added.status === 'added');

  const found = await ctx.findBlockedPlace('https://cdn.tracker.example.org/page?q=1');

  expect(found).toBe(added.shortID);
});

test('it finds nothing for a site at read, and nothing for a URL that is no address', async () => {
  const ctx = await setupTest();

  await ctx.addPlace('library.example.org', 'read');

  const found = await Promise.all([
    ctx.findBlockedPlace('https://library.example.org/'),
    ctx.findBlockedPlace('not a url'),
  ]);

  expect(found).toStrictEqual([null, null]);
});
