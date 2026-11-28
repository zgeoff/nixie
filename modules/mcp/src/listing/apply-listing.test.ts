import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { hashToolForm } from '../pin/hash-tool-form';
import { readToolRow } from '../rows/read-tool-rows';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';

async function setupTest() {
  const mcp = await startTestMcp();

  return {
    mcp,
    widened: buildToolForm({
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, recipient: { type: 'string' } },
        required: ['id'],
      },
    }),
    readTool: (tool: string) => readToolRow(mcp.log.writer.db, tool),
  };
}

test('it pins and exposes a new tool at its first listing, with no proposal', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());

  const moves = await ctx.mcp.list('tracker', { forms: [buildToolForm()] });
  const tool = await ctx.readTool('tracker.item_get');
  const open = await readOpenProposals(ctx.mcp.log.writer.db, ctx.mcp.context.now());

  expect(moves).toStrictEqual([
    {
      tool: 'tracker.item_get',
      fromHash: null,
      toHash: hashToolForm(buildToolForm()),
      cause: 'listed',
    },
  ]);

  expect([tool?.state, tool?.pinned_hash, tool?.proposal_id]).toStrictEqual([
    'exposed',
    hashToolForm(buildToolForm()),
    null,
  ]);

  expect(open).toStrictEqual([]);
});

test('it moves the pin of a changed tool that keeps its input shape, and tells you', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [first] });

  const moves = await ctx.mcp.list('tracker', { forms: [changed] });
  const tool = await ctx.readTool('tracker.item_get');
  const notices = await ctx.mcp.readNotices();

  expect([tool?.state, tool?.pinned_hash, tool?.proposal_id]).toStrictEqual([
    'exposed',
    hashToolForm(changed),
    null,
  ]);

  expect(moves).toStrictEqual([
    {
      tool: 'tracker.item_get',
      fromHash: hashToolForm(first),
      toHash: hashToolForm(changed),
      cause: 'changed',
    },
  ]);

  expect(notices).toStrictEqual([
    {
      serverID: 'tracker',
      tool: 'tracker.item_get',
      change: 'tool_changed',
      fromHash: hashToolForm(first),
      toHash: hashToolForm(changed),
    },
  ]);
});

test('it writes one notice for a tool whose form changes at one listing', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm()] });
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ description: 'One.' })] });

  const notices = await ctx.mcp.readNotices();

  expect(notices).toHaveLength(1);
});

test('it stops a tool that gains an input property until you accept the change', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [first] });
  await ctx.mcp.list('tracker', { forms: [ctx.widened] });

  const stopped = await ctx.readTool('tracker.item_get');

  await ctx.mcp.allow('tracker.item_get');

  const accepted = await ctx.readTool('tracker.item_get');

  expect([stopped?.state, stopped?.pinned_hash, stopped?.latest_hash]).toStrictEqual([
    'stopped_changed',
    hashToolForm(first),
    hashToolForm(ctx.widened),
  ]);

  expect([accepted?.state, accepted?.pinned_hash, accepted?.proposal_id]).toStrictEqual([
    'exposed',
    hashToolForm(ctx.widened),
    null,
  ]);
});

test('it keeps an accept that commits while the listing is between its read and its write', async () => {
  const ctx = await setupTest();

  const further = buildToolForm({
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, recipient: { type: 'string' }, cc: { type: 'string' } },
      required: ['id'],
    },
  });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm()] });
  await ctx.mcp.list('tracker', { forms: [ctx.widened] });

  await ctx.mcp.list('tracker', {
    forms: [further],
    afterRead: () => ctx.mcp.allow('tracker.item_get'),
  });

  const tool = await ctx.readTool('tracker.item_get');

  expect([tool?.state, tool?.pinned_hash, tool?.latest_hash]).toStrictEqual([
    'stopped_changed',
    hashToolForm(ctx.widened),
    hashToolForm(further),
  ]);
});

test('it closes the approval of a tool that the next listing omits', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm()] });
  await ctx.mcp.list('tracker', { forms: [] });

  const tool = await ctx.readTool('tracker.item_get');
  const open = await readOpenProposals(ctx.mcp.log.writer.db, ctx.mcp.context.now());

  expect([tool?.state, tool?.proposal_id, open]).toStrictEqual(['removed', null, []]);
});

test('it keeps a tool whose form the registry refuses hidden, with the reason and no approval', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ inputSchema: { type: 'string' } })] });

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'hidden_new',
    proposal_id: null,
    hidden_reason: expect.stringContaining('needs an object input schema'),
  });
});

test('it stops a tool that an override names and the server never listed', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());

  await ctx.mcp.list('tracker', {
    forms: [buildToolForm()],
    overrides: {
      item_notify: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  });

  const tool = await ctx.readTool('tracker.item_notify');

  expect(tool).toMatchObject({
    state: 'stopped_unfit',
    pinned_hash: null,
    hidden_reason: 'the override names item_notify, which the server does not list',
  });
});

test('it stops a pinned tool that the listing drops while an override names it', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm()] });

  await ctx.mcp.list('tracker', {
    forms: [],
    overrides: {
      item_get: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: null,
        reconcile: null,
      },
    },
  });

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'stopped_unfit',
    pinned_hash: hashToolForm(buildToolForm()),
    hidden_reason: 'the override names item_get, which the server does not list',
  });
});

test('it applies no override to a pinned tool named like an inherited member', async () => {
  const ctx = await setupTest();

  const forms = [buildToolForm({ name: 'constructor' }), buildToolForm({ name: 'toString' })];

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms, overrides: {} });
  await ctx.mcp.list('tracker', { forms, overrides: {} });

  const tools = await Promise.all([
    ctx.readTool('tracker.constructor'),
    ctx.readTool('tracker.toString'),
  ]);

  expect(tools.map((tool) => tool?.state)).toStrictEqual(['exposed', 'exposed']);
});

test('it hides a tool whose input schema holds an unresolved ref, and proposes nothing for it', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());

  await ctx.mcp.list('tracker', {
    forms: [
      buildToolForm({
        annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: { owner: { $ref: '#/$defs/missing' } } },
      }),
    ],
  });

  const tool = await ctx.readTool('tracker.item_get');
  const open = await readOpenProposals(ctx.mcp.log.writer.db, ctx.mcp.context.now());

  expect([tool?.state, tool?.proposal_id, tool?.hidden_reason, open]).toStrictEqual([
    'hidden_new',
    null,
    expect.stringContaining('does not compile'),
    [],
  ]);
});
