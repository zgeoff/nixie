import { expect, test } from 'bun:test';
import { removeRecordKey } from '@heynixie/log';
import type { ProxyCalls } from '../call/types';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { createToolCatalog } from './create-tool-catalog';

async function setupTest() {
  const mcp = await startTestMcp();

  const calls: ProxyCalls = {
    clear: () => Promise.resolve({ kind: 'cleared', pinnedHash: null }),
    send: () => Promise.resolve({ kind: 'failed', message: 'was never called' }),
  };

  const catalog = createToolCatalog(
    mcp.log,
    calls,
    () => Promise.resolve(),
    () => Promise.resolve({ definitionsHash: 'sha256:test', servers: {} }),
  );

  return {
    mcp,
    catalog,

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
