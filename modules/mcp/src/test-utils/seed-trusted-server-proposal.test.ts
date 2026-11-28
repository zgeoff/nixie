import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { readServerRows } from '../rows/read-server-rows';
import { buildServerFacts } from './build-server-facts';
import { seedTrustedServerProposal } from './seed-trusted-server-proposal';
import { startTestMcp } from './start-test-mcp';

test('#seedTrustedServerProposal leaves a held server that waits on one open proposal', async () => {
  const mcp = await startTestMcp();
  const proposalID = await seedTrustedServerProposal(mcp.context, 'tracker', buildServerFacts());
  const rows = await readServerRows(mcp.log.writer.db);
  const open = await readOpenProposals(mcp.log.writer.db, mcp.context.now());

  expect([
    rows.map((row) => [row.state, row.proposal_id]),
    open.map((row) => row.id),
  ]).toStrictEqual([[['held', proposalID]], [proposalID]]);
});
