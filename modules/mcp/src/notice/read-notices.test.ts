import { expect, test } from 'bun:test';
import { hashToolForm } from '../pin/hash-tool-form';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { readNotices } from './read-notices';

async function setupTest() {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());

  return { mcp, readNotices: (limit: number) => readNotices(mcp.context, limit) };
}

test('it reads the notice of a trusted server changing a tool, with the old and new hash', async () => {
  const ctx = await setupTest();

  const first = buildToolForm();
  const changed = buildToolForm({ description: 'Read one item, and say who owns it.' });

  await ctx.mcp.list('tracker', { forms: [first], isTrusted: true });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.mcp.list('tracker', { forms: [changed], isTrusted: true });

  const notices = await ctx.readNotices(10);

  expect(notices).toStrictEqual([
    {
      sequence: expect.any(Number),
      recordedAtMs: expect.any(Number),
      serverID: 'tracker',
      tool: 'tracker.item_get',
      change: 'tool_changed',
      fromHash: hashToolForm(first),
      toHash: hashToolForm(changed),
    },
  ]);
});

test('it reads the newest notice first and stops at the limit', async () => {
  const ctx = await setupTest();

  const form = buildToolForm();

  await ctx.mcp.list('tracker', { forms: [form, buildToolForm({ name: 'item_put' })] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.mcp.allow('tracker.item_put');
  await ctx.mcp.list('tracker', { forms: [] });

  const notices = await ctx.readNotices(1);

  expect(notices.map((notice) => [notice.tool, notice.change])).toStrictEqual([
    ['tracker.item_put', 'tool_removed'],
  ]);
});
