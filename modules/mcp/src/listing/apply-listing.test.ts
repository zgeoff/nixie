import { expect, test } from 'bun:test';
import { hashToolForm } from '../pin/hash-tool-form';
import { readToolRow } from '../rows/read-tool-rows';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';

async function setupTest() {
  const mcp = await startTestMcp();

  return { mcp, readTool: (tool: string) => readToolRow(mcp.log.writer.db, tool) };
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

test('it applies a changed tool of a trusted server and tells you', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.addServer('tracker', buildServerFacts({ trusted: true }));
  await ctx.mcp.list('tracker', { forms: [first], isTrusted: true });
  await ctx.mcp.allow('tracker.item_get');

  const moves = await ctx.mcp.list('tracker', { forms: [changed], isTrusted: true });
  const tool = await ctx.readTool('tracker.item_get');

  expect([tool, moves]).toMatchObject([
    { state: 'exposed', pinned_hash: hashToolForm(changed) },
    [{ tool: 'tracker.item_get', cause: 'trusted_change', toHash: hashToolForm(changed) }],
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
