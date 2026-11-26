import { expect, test } from 'bun:test';
import { readServerRows } from '../rows/read-server-rows';
import { runServerStart } from '../start/run-server-start';
import { buildServerFacts } from './build-server-facts';
import { startTestMcp } from './start-test-mcp';

test('it answers the proposal that a start wrote, and the server joins as added', async () => {
  const ctx = await startTestMcp();

  await runServerStart(ctx.context, {
    config: { tracker: buildServerFacts() },
    removeCredentials: () => Promise.resolve(),
  });

  const held = await readServerRows(ctx.log.writer.db);

  const proposalID = held[0]?.proposal_id ?? '';

  await ctx.answer(proposalID, 'approve');

  const added = await readServerRows(ctx.log.writer.db);

  expect([held[0]?.state, added[0]?.state]).toStrictEqual(['held', 'added']);
});
