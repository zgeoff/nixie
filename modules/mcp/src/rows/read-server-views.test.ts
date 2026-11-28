import { expect, test } from 'bun:test';
import { readProposal, runProposalLapses } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { initialHealth } from '../health/types';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { readServerViews } from './read-server-views';
import { readToolRow } from './read-tool-rows';

async function setupTest() {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());
  await mcp.list('tracker', { forms: [buildToolForm()] });

  // a form that widens the input stops the tool and waits for an accept
  await mcp.list('tracker', {
    forms: [
      buildToolForm({
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, owner: { type: 'string' } },
          required: ['id'],
        },
      }),
    ],
  });

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
      const proposal = await readProposal(mcp.log.writer.db, proposalID);

      invariant(proposal, 'the proposal exists');

      await runProposalLapses({ ...mcp.deps, clock: { now: () => proposal.lapsesAt } });
    },
  };
}

test('it shows no proposal on a tool once its proposal lapsed', async () => {
  const ctx = await setupTest();
  const row = await readToolRow(ctx.mcp.log.writer.db, 'tracker.item_get');

  const proposalID = row?.proposal_id ?? null;

  invariant(proposalID !== null, 'the tool waits for an accept');

  const before = await ctx.readToolProposals();

  await ctx.lapse(proposalID);

  const after = await ctx.readToolProposals();

  expect([before, after]).toStrictEqual([[proposalID], [null]]);
});
