import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { placesProjection, writePlaceAdded } from '@heynixie/policy';
import type { PlaceKey } from '@heynixie/policy';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import { buildPlacesListTool } from './build-places-list-tool';

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, placesProjection] };

  const context = {
    log,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
    runInForce: () => Promise.resolve(),
  };

  const tool = buildPlacesListTool(() => context);

  const add = async (key: PlaceKey, trust: 'known' | 'read' | 'act', name: string | null) => {
    const added = await writePlaceAdded(context, { key, trust, name, addedBy: 'you' });

    return added.status === 'added' ? added.shortID : 'missing';
  };

  return {
    tool,
    addThree: async () => ({
      library: await add(
        { kind: 'site', domain: 'library.example.org', subdomains: true },
        'read',
        'The library',
      ),
      tickets: await add(
        { kind: 'site', domain: 'tickets.example.com', subdomains: false },
        'act',
        null,
      ),
      sam: await add({ kind: 'address', address: 'sam@example.org' }, 'known', null),
    }),
    list: (input: JSONObject) =>
      tool.run(
        { callID: 'call-1', tool: 'places.list', input, toolUseID: null },
        buildMockToolContext(),
      ),
  };
}

test('it declares a read with no destination', async () => {
  const ctx = await setupTest();

  expect({
    effects: ctx.tool.declaration.effects,
    destinations: ctx.tool.declaration.destinations,
  }).toStrictEqual({ effects: ['read'], destinations: [] });
});

test('it lists each place by its short ID with its key, level and name', async () => {
  const ctx = await setupTest();
  const ids = await ctx.addThree();
  const outcome = await ctx.list({ trust: 'read', kind: 'site', query: 'library', limit: 20 });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      total: 1,
      places: [
        { place: ids.library, key: '*.library.example.org', trust: 'read', name: 'The library' },
      ],
    },
  });
});

test('it returns the entry that covers a host', async () => {
  const ctx = await setupTest();
  const ids = await ctx.addThree();
  const outcome = await ctx.list({ place: 'catalog.library.example.org' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { total: 1, places: [{ place: ids.library }] },
  });
});

test('it counts every match in total, and pages with after', async () => {
  const ctx = await setupTest();
  const ids = await ctx.addThree();
  const first = await ctx.list({ limit: 2 });
  const second = await ctx.list({ limit: 2, after: ids.tickets });

  expect({ first, second }).toMatchObject({
    first: { result: { total: 3, nextAfter: ids.tickets } },
    second: { result: { total: 3, places: [{ place: ids.sam }] } },
  });
});

test('it never shows a place by its UUID', async () => {
  const ctx = await setupTest();

  await ctx.addThree();

  const outcome = await ctx.list({ detail: true });

  expect(JSON.stringify(outcome)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/u);
});
