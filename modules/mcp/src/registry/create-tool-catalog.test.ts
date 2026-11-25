import { expect, test } from 'bun:test';
import { removeRecordKey } from '@heynixie/log';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { createToolCatalog } from './create-tool-catalog';

async function setupTest() {
  const mcp = await startTestMcp();

  return {
    mcp,
    catalog: createToolCatalog(mcp.log),

    // erases the form of every tool a listing held, as a forget of the listing records does
    eraseForms: async () => {
      const db = mcp.log.writer.db.$extendTables<{
        records: { sequence: number; key_id: string | null; kind: string };
      }>();

      const rows = await db
        .selectFrom('records')
        .select('key_id')
        .where('kind', '=', 'mcp.tool_listed')
        .execute();

      for (const row of rows) {
        await removeRecordKey(mcp.log, row.key_id ?? '');
      }
    },
  };
}

test('it registers an allowed tool as the server ID, a dot and the tool name', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.catalog.refresh();

  expect([
    ctx.catalog.toolNames(),
    ctx.catalog.findTool('tracker.item_get')?.definition.name,
  ]).toStrictEqual([['tracker.item_get'], 'tracker.item_get']);
});

test('it never registers a tool that has no pin', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.catalog.refresh();

  expect([ctx.catalog.toolNames(), ctx.catalog.findTool('tracker.item_get')]).toStrictEqual([
    [],
    null,
  ]);
});

test('it keeps a tool whose name the model cannot read out of the registry', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item get!' })] });
  await ctx.catalog.refresh();

  expect(ctx.catalog.toolNames()).toStrictEqual([]);
});

test('it drops a tool whose pinned form was erased, though it served the same hash before', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.catalog.refresh();

  const served = ctx.catalog.toolNames();

  await ctx.eraseForms();
  await ctx.catalog.refresh();

  expect([served, ctx.catalog.toolNames()]).toStrictEqual([['tracker.item_get'], []]);
});

test('it ends each valid call to a registered tool with the unavailable result, before any decision', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.catalog.refresh();

  const definition = ctx.catalog.findTool('tracker.item_get')?.definition;

  const prepared = await definition?.prepare?.(
    { id: 'item-1' },
    {
      run: {
        runID: 'run-1',
        thread: 'thread-1',
        logThread: 'thread-1',
        tools: ['tracker.item_get'],
        model: { model: 'model-1', profile: 'profile-1' },
      },
    },
  );

  expect([definition?.execution, prepared]).toStrictEqual([
    'queued',
    {
      result: { text: 'tracker.item_get cannot run yet: the proxy has no call path in this build' },
      refusalCode: 'unavailable',
    },
  ]);
});
