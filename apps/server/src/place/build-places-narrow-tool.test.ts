import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { placesProjection, readPlaces, writePlaceAdded } from '@heynixie/policy';
import type { PlaceKey } from '@heynixie/policy';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildPlacesNarrowTool } from './build-places-narrow-tool';

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, placesProjection] };

  const context = {
    log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    runInForce: () => Promise.resolve(),
  };

  const tool = buildPlacesNarrowTool(() => context);

  return {
    tool,
    log,
    site: (domain: string, subdomains = false): PlaceKey => ({ kind: 'site', domain, subdomains }),
    add: async (key: PlaceKey, trust: 'blocked' | 'known' | 'read' | 'act') => {
      const added = await writePlaceAdded(context, { key, trust, name: null, addedBy: 'you' });

      return added.status === 'added' ? added.shortID : 'missing';
    },
    narrow: (input: JSONObject) =>
      tool.run(
        { callID: 'call-1', tool: 'places.narrow', input, toolUseID: null },
        buildMockToolContext(),
      ),
  };
}

test('it declares the narrowing of the policy, which applies at once', async () => {
  const ctx = await setupTest();

  expect(ctx.tool.declaration.effects).toStrictEqual(['policy_narrow']);
});

test('it lowers a place at once and names it by its short ID', async () => {
  const ctx = await setupTest();
  const place = await ctx.add(ctx.site('tickets.example.com'), 'act');
  const outcome = await ctx.narrow({ place, trust: 'known' });
  const places = await readPlaces(ctx.log);

  expect({ outcome, levels: places.map((entry) => entry.trust) }).toStrictEqual({
    outcome: { status: 'ok', result: { place, trust: 'known' } },
    levels: ['known'],
  });
});

test('it removes a place', async () => {
  const ctx = await setupTest();
  const place = await ctx.add(ctx.site('tickets.example.com'), 'read');
  const outcome = await ctx.narrow({ place, remove: true });
  const places = await readPlaces(ctx.log);

  expect({ outcome, listed: places.length }).toStrictEqual({
    outcome: { status: 'ok', result: { place, removed: true } },
    listed: 0,
  });
});

test('it refuses a level that is not lower than the current one, and changes nothing', async () => {
  const ctx = await setupTest();
  const place = await ctx.add(ctx.site('tickets.example.com'), 'read');
  const outcome = await ctx.narrow({ place, trust: 'read' });
  const places = await readPlaces(ctx.log);

  expect({ status: outcome.status, levels: places.map((entry) => entry.trust) }).toStrictEqual({
    status: 'error',
    levels: ['read'],
  });
});

test('it refuses to remove a blocked place, which would make it free to read', async () => {
  const ctx = await setupTest();
  const place = await ctx.add(ctx.site('tickets.example.com'), 'blocked');
  const outcome = await ctx.narrow({ place, remove: true });
  const places = await readPlaces(ctx.log);

  expect({ status: outcome.status, removed: places.map((entry) => entry.isRemoved) }).toStrictEqual(
    { status: 'error', removed: [false] },
  );
});

test('it refuses a removal that leaves a covered site at a higher level than before', async () => {
  const ctx = await setupTest();

  await ctx.add(ctx.site('example.org', true), 'act');

  const place = await ctx.add(ctx.site('forms.example.org'), 'known');
  const outcome = await ctx.narrow({ place, remove: true });
  const places = await readPlaces(ctx.log);

  expect({ status: outcome.status, removed: places.map((entry) => entry.isRemoved) }).toStrictEqual(
    { status: 'error', removed: [false, false] },
  );
});

test('it refuses a call that gives neither a level nor a removal', async () => {
  const ctx = await setupTest();
  const place = await ctx.add(ctx.site('tickets.example.com'), 'read');
  const outcome = await ctx.narrow({ place });

  expect(outcome.status).toBe('error');
});

test('it refuses a place that no entry has', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.narrow({ place: 'zzzzzzzzzz', remove: true });

  expect(outcome.status).toBe('error');
});
