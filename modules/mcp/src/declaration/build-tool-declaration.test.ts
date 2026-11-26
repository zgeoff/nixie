import { expect, onTestFinished, test } from 'bun:test';
import { buildActionAttempt } from '../test-utils/build-action-attempt';
import { startStandInMcp } from '../test-utils/start-stand-in-mcp';

async function setupTest() {
  const itemGet = {
    name: 'item_get',
    description: 'Read one item.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  };

  const itemFind = {
    name: 'item_find',
    description: 'Find an item by its request.',
    inputSchema: { type: 'object', properties: { request_id: { type: 'string' } } },
    annotations: { readOnlyHint: true },
    answer: { content: [{ type: 'text', text: 'item 7: water the plants' }] },
  };

  const itemNotify = {
    name: 'item_notify',
    description: 'Tell the assignee about an item.',
    inputSchema: {
      type: 'object',
      properties: {
        assignee_email: { type: 'string' },
        message: { type: 'string' },
        request_id: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  };

  const standIn = await startStandInMcp({ tools: [itemGet, itemFind, itemNotify] });

  onTestFinished(() => standIn.mcp.stop());

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  return {
    ...standIn,
    itemFind,
    itemNotify,
    readState: async (tool: string) => {
      const rows = await standIn.mcp.readTools('tracker');

      const found = rows.find((row) => row.tool === tool);

      return found?.state ?? null;
    },
    allow: async (tool: string) => {
      await standIn.test.allow(tool);
      await standIn.mcp.tools.refresh();
    },
  };
}

test('it declares a tool by its annotations when the definitions hold no override', async () => {
  const ctx = await setupTest();

  await ctx.allow('tracker.item_notify');

  expect(ctx.mcp.tools.findDeclaration('tracker.item_notify')).toStrictEqual({
    tool: 'tracker.item_notify',
    declaration: {
      effects: ['write', 'send'],
      destinations: [],
      amount: null,
      content: ['assignee_email', 'message', 'request_id'],
    },
    reconcile: null,
    from: 'annotations',
    pinnedHash: expect.stringMatching(/^sha256:/u),
    definitionsHash: null,
  });
});

test('it declares a tool by its override, and names the snapshot that held it', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: ['assignee_email'],
        amount: null,
        content: ['message'],
        reconcile: null,
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  expect([
    ctx.mcp.tools.findDeclaration('tracker.item_notify'),
    ctx.mcp.tools.findTool('tracker.item_notify')?.definition.declaration.destinations,
  ]).toStrictEqual([
    {
      tool: 'tracker.item_notify',
      declaration: {
        effects: ['send'],
        destinations: ['assignee_email'],
        amount: null,
        content: ['message'],
      },
      reconcile: null,
      from: 'override',
      pinnedHash: expect.stringMatching(/^sha256:/u),
      definitionsHash: 'sha256:overrides',
    },
    ['assignee_email'],
  ]);
});

test('it leaves a tool stopped as unfit when its override names an argument the pinned schema lacks', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: ['to'],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  expect([
    await ctx.readState('tracker.item_notify'),
    ctx.mcp.tools.findDeclaration('tracker.item_notify')?.from,
  ]).toStrictEqual(['stopped_unfit', 'annotations']);
});

test('it stops a tool whose override checks with a tool the server lacks', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { check: 'item_lookup' },
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  const state = await ctx.readState('tracker.item_notify');

  expect(state).toBe('stopped_unfit');
});

test('it stops a pinned tool when a new seed brings an override that no longer fits, and frees it again', async () => {
  const ctx = await setupTest();

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: ['to'],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  });

  await ctx.mcp.refit();

  const stopped = await ctx.readState('tracker.item_notify');

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: ['assignee_email'],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  });

  await ctx.mcp.refit();

  expect([
    stopped,
    await ctx.readState('tracker.item_notify'),
    ctx.mcp.tools.findDeclaration('tracker.item_notify')?.from,
  ]).toStrictEqual(['stopped_unfit', 'exposed', 'override']);
});

test('it serves a pinned tool under the override of a seed that arrives after the pin', async () => {
  const ctx = await setupTest();

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  const before = ctx.mcp.tools.findDeclaration('tracker.item_notify')?.declaration.effects;

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  });

  await ctx.mcp.refit();

  const after = ctx.mcp.tools.findDeclaration('tracker.item_notify')?.declaration.effects;

  expect([before, after]).toStrictEqual([['write', 'send'], ['send']]);
});

test('it fills the idempotency key argument with the action ID of an approved call', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { idempotencyKey: 'request_id' },
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  const connector = ctx.mcp.findConnector('tracker.item_notify');

  const attempt = buildActionAttempt({
    tool: 'tracker.item_notify',
    actionID: 'action-9',
    arguments: { message: 'hi' },
  });

  await connector?.run(attempt);

  expect([connector?.reconcile, ctx.site.calls.map((call) => call.args)]).toStrictEqual([
    { kind: 'idempotency_key', where: 'request_id', keptForMs: 86_400_000 },
    [{ message: 'hi', request_id: 'action-9' }],
  ]);
});

test('it settles an interrupted call by what the check tool finds, with the input of the call', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { check: 'item_find' },
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_find');
  await ctx.allow('tracker.item_notify');

  const connector = ctx.mcp.findConnector('tracker.item_notify');

  const attempt = buildActionAttempt({
    tool: 'tracker.item_notify',
    arguments: { request_id: 'r-1' },
    snapshotHash: 'sha256:overrides',
  });

  const found = await connector?.check?.(attempt);

  expect([
    connector?.reconcile,
    found,
    ctx.site.calls.map((call) => [call.tool, call.args]),
  ]).toStrictEqual([
    { kind: 'check', tool: 'tracker.item_find', onNotFound: 'retry' },
    { kind: 'found', result: { text: 'item 7: water the plants' } },
    [['item_find', { request_id: 'r-1' }]],
  ]);
});

test('it counts a check that finds nothing as not done', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { check: 'item_find' },
      },
    },
  });

  ctx.site.setTools([
    { ...ctx.itemFind, answer: { content: [{ type: 'text', text: '' }] } },
    ctx.itemNotify,
  ]);

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_find');
  await ctx.allow('tracker.item_notify');

  const connector = ctx.mcp.findConnector('tracker.item_notify');

  const attempt = buildActionAttempt({
    tool: 'tracker.item_notify',
    arguments: { request_id: 'r-1' },
    snapshotHash: 'sha256:overrides',
  });

  const found = await connector?.check?.(attempt);

  expect(found).toStrictEqual({ kind: 'not_found' });
});

test('it runs no check tool that declares more than a read', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { check: 'item_find' },
      },
      item_find: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: [],
        reconcile: null,
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_find');
  await ctx.allow('tracker.item_notify');

  const connector = ctx.mcp.findConnector('tracker.item_notify');

  const attempt = buildActionAttempt({
    tool: 'tracker.item_notify',
    arguments: { request_id: 'r-1' },
    snapshotHash: 'sha256:overrides',
  });

  const found = await connector?.check?.(attempt);

  expect([found, ctx.site.calls.length]).toStrictEqual([{ kind: 'inconclusive' }, 0]);
});

test('it settles no interrupted call by a check that a later snapshot declares', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { check: 'item_find' },
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_find');
  await ctx.allow('tracker.item_notify');

  const connector = ctx.mcp.findConnector('tracker.item_notify');

  const attempt = buildActionAttempt({
    tool: 'tracker.item_notify',
    arguments: { request_id: 'r-1' },
    snapshotHash: 'sha256:earlier',
  });

  const found = await connector?.check?.(attempt);

  expect([found, ctx.site.calls.length]).toStrictEqual([{ kind: 'inconclusive' }, 0]);
});

test('it retries no earlier attempt under a key argument that a later snapshot declares', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { idempotencyKey: 'request_id' },
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  const connector = ctx.mcp.findConnector('tracker.item_notify');

  const attempt = buildActionAttempt({
    tool: 'tracker.item_notify',
    arguments: { message: 'hi' },
    attempt: 2,
    snapshotHash: 'sha256:earlier',
  });

  const response = await connector?.run(attempt);

  expect([response, ctx.site.calls.length]).toStrictEqual([
    {
      kind: 'ambiguous',
      reason:
        'tracker.item_notify changed its declaration after the first attempt, so nothing was retried',
    },
    0,
  ]);
});

test('it accepts a call that leaves out a required argument which the idempotency key fills', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: { idempotencyKey: 'request_id' },
      },
    },
  });

  ctx.site.setTools([
    ctx.itemFind,
    {
      ...ctx.itemNotify,
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' }, request_id: { type: 'string' } },
        required: ['message', 'request_id'],
      },
    },
  ]);

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  const tool = ctx.mcp.tools.findTool('tracker.item_notify');

  expect([
    tool?.parseInput({ message: 'hi' }),
    ctx.mcp.tools.findDeclaration('tracker.item_notify')?.declaration.content,
  ]).toStrictEqual([{ isValid: true }, ['message']]);
});

test('it leaves a tool stopped as unfit when its override names the idempotency key as a destination', async () => {
  const ctx = await setupTest();

  ctx.setOverrides({
    tracker: {
      item_notify: {
        effects: ['send'],
        destinations: ['request_id'],
        amount: null,
        content: null,
        reconcile: { idempotencyKey: 'request_id' },
      },
    },
  });

  await ctx.mcp.list('tracker');
  await ctx.allow('tracker.item_notify');

  const state = await ctx.readState('tracker.item_notify');

  expect(state).toBe('stopped_unfit');
});
