import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { readToolRow } from '../rows/read-tool-rows';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { allowTool } from './allow-tool';

async function setupTest() {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());
  await mcp.list('tracker', { forms: [buildToolForm()] });

  return {
    mcp,
    declineOpen: async () => {
      const row = await readToolRow(mcp.log.writer.db, 'tracker.item_get');

      await mcp.answer(row?.proposal_id ?? '', 'decline');
    },
    allow: () => allowTool(mcp.context, 'tracker.item_get'),
    readOpen: () => readOpenProposals(mcp.log.writer.db, mcp.context.now()),
  };
}

test('it writes a new allow proposal after you declined the first, though the listing is unchanged', async () => {
  const ctx = await setupTest();

  await ctx.declineOpen();
  await ctx.mcp.list('tracker', { forms: [buildToolForm()] });

  const before = await ctx.readOpen();
  const allowed = await ctx.allow();
  const open = await ctx.readOpen();

  expect([before, allowed.status, open.length]).toStrictEqual([[], 'proposed', 1]);
});

test('it answers that an unknown tool has nothing to allow', async () => {
  const ctx = await setupTest();
  const allowed = await allowTool(ctx.mcp.context, 'tracker.item_put');

  expect(allowed).toStrictEqual({ status: 'unknown_tool' });
});
