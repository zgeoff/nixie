import { expect, test } from 'bun:test';
import { buildBuiltInBudgets } from '@heynixie/budgets';
import { removeRecordKey } from '@heynixie/log';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, findToolDeclaration, runToolCall } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { createToolCatalog } from './create-tool-catalog';

async function setupTest() {
  const mcp = await startTestMcp();

  const catalog = createToolCatalog(mcp.log);
  const registry = buildToolRegistry([], [catalog]);
  const queue = buildStubActionQueue();

  return {
    mcp,
    catalog,
    queue,

    // sends one call through the call path that the model's tool calls take
    callTool: (tool: string, input: Record<string, string>) =>
      runToolCall(
        { tool, input, toolUseID: 'toolu_1' },
        {
          runID: 'run-1',
          thread: 'thread-1',
          logThread: 'thread-1',
          tools: [tool],
          model: { model: 'model-1', profile: 'profile-1' },
        },
        {
          registry,
          decide: readStarterDecisionPoint((name) => findToolDeclaration(registry, name)),
          log: mcp.log,
          definitions: mcp.context.definitions,
          queue: queue.queue,
          queuedWaitMs: 10_000,
          budgets: {
            log: mcp.log,
            clock: mcp.clock,
            zone: 'UTC',
            definitions: mcp.context.definitions,
            builtIn: () => buildBuiltInBudgets([]),
          },
        },
      ),

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

test('it returns the unavailable result to the caller of a valid call, and queues no action', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.catalog.refresh();

  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  expect([result, ctx.queue.actions.length]).toStrictEqual([
    {
      content: [],
      structuredContent: {
        text: 'tracker.item_get cannot run yet: the proxy has no call path in this build',
      },
    },
    0,
  ]);
});
