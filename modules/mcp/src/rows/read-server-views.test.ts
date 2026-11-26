import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readProposal } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { initialHealth } from '../health/types';
import { makeMcpProposalHandler } from '../proposal/make-mcp-proposal-handler';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { readServerViews } from './read-server-views';
import { readToolRow } from './read-tool-rows';

async function setupTest() {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());
  await mcp.list('tracker', { forms: [buildToolForm()] });

  return {
    mcp,
    readToolProposals: async () => {
      const views = await readServerViews(mcp.log.writer.db, {
        nowMs: mcp.clock.now(),
        signIns: new Map(),
        getHealth: () => initialHealth,
      });

      return views[0]?.tools.map((tool) => tool.proposalID);
    },
    lapse: async (proposalID: string) => {
      const handler = makeMcpProposalHandler({
        ...mcp.context,
        removeCredentials: () => Promise.resolve(),
      });

      const proposal = await readProposal(mcp.log.writer.db, proposalID);

      invariant(proposal, 'the proposal exists');

      await withWriteTransaction(mcp.log.writer, async (tx) => {
        await handler.lapse(tx, proposal);
      });
    },
  };
}

test('it shows no proposal on a tool once its proposal lapsed', async () => {
  const ctx = await setupTest();
  const row = await readToolRow(ctx.mcp.log.writer.db, 'tracker.item_get');

  invariant(row?.proposal_id, 'the tool waits for an allow');

  const before = await ctx.readToolProposals();

  await ctx.lapse(row.proposal_id);

  const after = await ctx.readToolProposals();

  expect([before, after]).toStrictEqual([[row.proposal_id], [null]]);
});
