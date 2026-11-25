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
    readTool: (tool: string) => readToolRow(mcp.log.writer.db, tool),
  };
}

test('it stops a changed tool of an untrusted server until you allow it', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [first] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.mcp.list('tracker', { forms: [changed] });

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'stopped_changed',
    pinned_hash: hashToolForm(first),
    latest_hash: hashToolForm(changed),
  });
});

test('it exposes a changed tool of an untrusted server in the new form once you allow it', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [first] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.mcp.list('tracker', { forms: [changed] });
  await ctx.mcp.allow('tracker.item_get');

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'exposed',
    pinned_hash: hashToolForm(changed),
    latest_hash: hashToolForm(changed),
    proposal_id: null,
  });
});

test('it applies a changed tool of a trusted server and tells you', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.addServer('tracker', buildServerFacts({ trusted: true }));
  await ctx.mcp.list('tracker', { forms: [first], isTrusted: true });
  await ctx.mcp.allow('tracker.item_get');

  const moves = await ctx.mcp.list('tracker', { forms: [changed], isTrusted: true });
  const tool = await ctx.readTool('tracker.item_get');
  const notices = await ctx.mcp.readNotices();

  expect([tool, moves, notices]).toMatchObject([
    { state: 'exposed', pinned_hash: hashToolForm(changed) },
    [{ tool: 'tracker.item_get', cause: 'trusted_change', toHash: hashToolForm(changed) }],
    [
      {
        tool: 'tracker.item_get',
        change: 'tool_changed',
        fromHash: hashToolForm(first),
        toHash: hashToolForm(changed),
      },
    ],
  ]);
});

test('it keeps a new tool hidden on a trusted server', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts({ trusted: true }));
  await ctx.mcp.list('tracker', { forms: [buildToolForm()], isTrusted: true });

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'hidden_new',
    pinned_hash: null,
  });
});

test('it stops a tool of a trusted server that gains an input property', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();

  const widened = buildToolForm({
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, recipient: { type: 'string' } },
      required: ['id'],
    },
  });

  await ctx.mcp.addServer('tracker', buildServerFacts({ trusted: true }));
  await ctx.mcp.list('tracker', { forms: [first], isTrusted: true });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.mcp.list('tracker', { forms: [widened], isTrusted: true });

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'stopped_changed',
    pinned_hash: hashToolForm(first),
  });
});

test('it keeps an allow that commits while the listing is between its read and its write', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [first] });

  await ctx.mcp.list('tracker', {
    forms: [changed],
    afterRead: () => ctx.mcp.allow('tracker.item_get'),
  });

  const tool = await ctx.readTool('tracker.item_get');

  expect(tool).toMatchObject({
    state: 'stopped_changed',
    pinned_hash: hashToolForm(first),
    latest_hash: hashToolForm(changed),
  });
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
  await ctx.mcp.allow('tracker.item_get');

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
  await ctx.mcp.allow('tracker.constructor');
  await ctx.mcp.allow('tracker.toString');
  await ctx.mcp.list('tracker', { forms, overrides: {} });

  const tools = await Promise.all([
    ctx.readTool('tracker.constructor'),
    ctx.readTool('tracker.toString'),
  ]);

  expect(tools.map((tool) => tool?.state)).toStrictEqual(['exposed', 'exposed']);
});
