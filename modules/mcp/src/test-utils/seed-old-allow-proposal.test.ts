import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { readToolRow } from '../rows/read-tool-rows';
import { buildServerFacts } from './build-server-facts';
import { buildToolForm } from './build-tool-form';
import { seedOldAllowProposal } from './seed-old-allow-proposal';
import { startTestMcp } from './start-test-mcp';

test('#seedOldAllowProposal leaves a hidden tool that waits on one open proposal', async () => {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());

  const proposalID = await seedOldAllowProposal(mcp.context, 'tracker', buildToolForm());
  const tool = await readToolRow(mcp.log.writer.db, 'tracker.item_get');
  const open = await readOpenProposals(mcp.log.writer.db, mcp.context.now());

  expect([tool?.state, tool?.proposal_id, open.map((row) => row.id)]).toStrictEqual([
    'hidden_new',
    proposalID,
    [proposalID],
  ]);
});
