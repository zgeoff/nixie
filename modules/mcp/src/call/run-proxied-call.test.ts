import { expect, test } from 'bun:test';
import { buildBuiltInBudgets } from '@heynixie/budgets';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, findToolDeclaration, runToolCall } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import { buildActionAttempt } from '../test-utils/build-action-attempt';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startStandInMcp } from '../test-utils/start-stand-in-mcp';
import { buildMcpServersTool } from '../tool/build-mcp-servers-tool';

async function setupTest() {
  const itemGet = {
    name: 'item_get',
    description: 'Read one item.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
    answer: { content: [{ type: 'text', text: 'item 1: water the plants' }] },
  };

  const itemCreate = {
    name: 'item_create',
    description: 'File an item.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  };

  const standIn = await startStandInMcp({ tools: [itemGet, itemCreate] });

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  const registry = buildToolRegistry([buildMcpServersTool(() => standIn.mcp)], [standIn.mcp.tools]);
  const queue = buildStubActionQueue();

  return {
    ...standIn,
    itemGet,
    itemCreate,
    registry,
    queue,

    // approves the allow proposal of a tool, so the proxy serves it
    allow: async (tool: string) => {
      await standIn.test.allow(tool);
      await standIn.mcp.tools.refresh();
    },

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
          log: standIn.test.log,
          definitions: standIn.test.context.definitions,
          queue: queue.queue,
          queuedWaitMs: 10_000,
          budgets: {
            log: standIn.test.log,
            clock: standIn.test.clock,
            zone: 'UTC',
            definitions: standIn.test.context.definitions,
            builtIn: () => buildBuiltInBudgets([]),
          },
        },
      ),
  };
}

test('it runs an allowed read tool and returns its answer fenced as untrusted, with no structured content', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  expect([result, ctx.site.calls.map((call) => [call.tool, call.args])]).toStrictEqual([
    {
      content: [
        {
          type: 'text',
          text: expect.stringMatching(
            /^<tool-result source="untrusted" fence="[0-9a-f]+">\nitem 1: water the plants\n<\/tool-result fence="[0-9a-f]+">$/u,
          ),
        },
      ],
    },
    [['item_get', { id: 'item-1' }]],
  ]);
});

test('it sends the call with the access token of the server, which no result repeats', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  const token = ctx.site.readLatestAccessToken() ?? 'none';

  expect([ctx.site.calls[0]?.authorization, JSON.stringify(result).includes(token)]).toStrictEqual([
    `Bearer ${token}`,
    false,
  ]);
});

test('it holds a call of a writing tool for your approval and sends nothing to the server', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_create');

  const result = await ctx.callTool('tracker.item_create', { title: 'water the plants' });

  expect([result, ctx.site.calls.length]).toStrictEqual([
    {
      content: [{ type: 'text', text: expect.stringMatching(/^Waiting for approval as /u) }],
      isError: false,
    },
    0,
  ]);
});

test('it returns the text of a server error fenced, with isError set', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  ctx.site.setTools([
    {
      ...ctx.itemGet,
      answer: { content: [{ type: 'text', text: 'no such item' }], isError: true },
    },
    ctx.itemCreate,
  ]);

  const result = await ctx.callTool('tracker.item_get', { id: 'item-9' });

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: expect.stringMatching(
          /^<tool-result source="untrusted" fence="[0-9a-f]+">\nno such item\n<\/tool-result fence="[0-9a-f]+">$/u,
        ),
      },
    ],
    isError: true,
  });
});

test('it hides a tool whose annotations name no effects, and denies a call to it', async () => {
  const ctx = await setupTest();

  await ctx.test.list('tracker', {
    forms: [buildToolForm({ name: 'item_peek', annotations: { readOnlyHint: 'yes' } })],
  });

  await ctx.mcp.tools.refresh();

  const tools = await ctx.mcp.readTools('tracker');

  const row = tools.find((candidate) => candidate.tool === 'tracker.item_peek');

  const result = await ctx.callTool('tracker.item_peek', { id: 'item-1' });

  expect([
    row?.state,
    row?.hidden_reason?.includes('no declaration'),
    row?.proposal_id,
    ctx.registry.toolNames.includes('tracker.item_peek'),
    result.isError,
    ctx.site.calls.length,
  ]).toStrictEqual(['hidden_new', true, null, false, true, 0]);
});

test('it refuses a call to a tool that changed and waits, and never asks you to approve it', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  ctx.site.setTools([
    { ...ctx.itemGet, description: 'Read one item, and say who owns it.' },
    ctx.itemCreate,
  ]);

  await ctx.mcp.list('tracker');
  await ctx.mcp.tools.refresh();

  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  expect([result, ctx.queue.actions.length, ctx.site.calls.length]).toStrictEqual([
    {
      content: [{ type: 'text', text: 'tracker.item_get changed and waits for your review' }],
      isError: true,
    },
    0,
    0,
  ]);
});

test('it keeps the pinned tools on the list when the server fails its listing, and a call names the server and the next try', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  ctx.site.failListings(true);

  const listed = await ctx.mcp.list('tracker');
  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  expect([
    listed.status,
    ctx.registry.toolNames.filter((name) => name.startsWith('tracker.')),
    result,
    ctx.site.calls.length,
  ]).toStrictEqual([
    'failed',
    ['tracker.item_get'],
    { content: [{ type: 'text', text: 'tracker is unreachable, next try 09:01' }], isError: true },
    0,
  ]);
});

test('it tries the listing itself when a call finds the next try due, and runs the call once the listing passes', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  ctx.site.failListings(false);
  ctx.test.clock.advance(61_000);

  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: expect.stringMatching(
          /^<tool-result source="untrusted" fence="[0-9a-f]+">\nitem 1: water the plants\n<\/tool-result fence="[0-9a-f]+">$/u,
        ),
      },
    ],
  });
});

test('it makes the try that a call finds due and returns the next try when that listing fails too', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  ctx.test.clock.advance(61_000);

  const before = ctx.site.readListingCount();

  const result = await ctx.callTool('tracker.item_get', { id: 'item-1' });

  expect([ctx.site.readListingCount() - before, result.content]).toStrictEqual([
    1,
    [{ type: 'text', text: 'tracker is unreachable, next try 09:03' }],
  ]);
});

test('it writes one record when the server becomes unhealthy after 3 failed listings, and one when it recovers', async () => {
  const ctx = await setupTest();

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  ctx.test.clock.advance(61_000);

  await ctx.mcp.list('tracker');

  ctx.test.clock.advance(121_000);

  await ctx.mcp.list('tracker');

  ctx.test.clock.advance(241_000);

  await ctx.mcp.list('tracker');

  const unhealthy = await ctx.test.readHealthChanges();

  ctx.site.failListings(false);

  await ctx.mcp.list('tracker');

  const recovered = await ctx.test.readHealthChanges();

  expect([unhealthy, recovered]).toStrictEqual([
    [{ serverID: 'tracker', isUnhealthy: true, lastError: 'error', nextTryAt: expect.any(Number) }],
    [
      { serverID: 'tracker', isUnhealthy: true, lastError: 'error', nextTryAt: expect.any(Number) },
      { serverID: 'tracker', isUnhealthy: false, lastError: null, nextTryAt: null },
    ],
  ]);
});

test('it writes no record for a server that failed twice and passed again', async () => {
  const ctx = await setupTest();

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');
  await ctx.mcp.list('tracker');

  ctx.site.failListings(false);

  await ctx.mcp.list('tracker');

  const changes = await ctx.test.readHealthChanges();

  expect(changes).toStrictEqual([]);
});

test('it writes a recovery record at the start for a server whose last record said unhealthy', async () => {
  const ctx = await setupTest();

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  ctx.test.clock.advance(3_600_000);

  await ctx.mcp.list('tracker');

  ctx.test.clock.advance(3_600_000);

  await ctx.mcp.list('tracker');

  const restarted = ctx.restart();

  await restarted.start();

  const changes = await ctx.test.readHealthChanges();

  expect(changes.map((change) => change.isUnhealthy)).toStrictEqual([true, false]);
});

test('it lists a server before a task run reads its tool list, and leaves the backoff alone', async () => {
  const ctx = await setupTest();

  const first = ctx.site.readListingCount();

  await ctx.registry.prepareTaskRun(['tracker.item_get']);

  const second = ctx.site.readListingCount();

  ctx.site.failListings(true);

  await ctx.mcp.list('tracker');

  const third = ctx.site.readListingCount();

  await ctx.registry.prepareTaskRun(['tracker.item_get']);

  expect([second - first, ctx.site.readListingCount() - third]).toStrictEqual([1, 0]);
});

test('it runs an approved call of a queued tool through the connector, and refuses it once the tool is stopped', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_create');

  const connector = ctx.mcp.findConnector('tracker.item_create');
  const attempt = buildActionAttempt();

  const done = await connector?.run(attempt);

  ctx.site.setTools([ctx.itemGet, { ...ctx.itemCreate, description: 'File an item, quietly.' }]);

  await ctx.mcp.list('tracker');

  const stopped = await connector?.run(attempt);

  expect([done, stopped, ctx.site.calls.length]).toStrictEqual([
    { kind: 'success', result: { text: 'called item_create' } },
    { kind: 'refused', reason: 'tracker.item_create changed and waits for your review' },
    1,
  ]);
});

test('it finds no connector for a tool the proxy does not serve', async () => {
  const ctx = await setupTest();

  expect(ctx.mcp.findConnector('tracker.item_get')).toBeUndefined();
});

test('it tells the model each server with its sign-in, health and tool counts', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_get');
  await ctx.allow('tracker.item_create');

  ctx.site.setTools([ctx.itemGet, { ...ctx.itemCreate, description: 'File an item, quietly.' }]);

  await ctx.mcp.list('tracker');

  const result = await ctx.callTool('mcp.servers', {});

  expect(result.structuredContent).toStrictEqual({
    servers: [
      {
        server: 'tracker',
        state: 'added',
        signIn: 'ok',
        health: 'healthy',
        tools: { exposed: 1, stopped: 1, hidden: 0 },
      },
    ],
  });
});
