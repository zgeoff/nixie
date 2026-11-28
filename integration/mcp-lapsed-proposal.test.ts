import { expect, test } from 'bun:test';
import { startStandInMcp } from '@heynixie/mcp/test-utils';
import { readProposal, runProposalLapses } from '@heynixie/proposals';
import { describeToolState } from '@heynixie/web/describe-tool-state';
import invariant from 'tiny-invariant';

async function setupTest() {
  const standIn = await startStandInMcp({
    tools: [
      {
        name: 'item_get',
        description: 'Read one item.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ],
  });

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  const readTools = async () => {
    const views = await standIn.mcp.readServerViews();

    return views[0]?.tools ?? [];
  };

  return {
    ...standIn,
    readToolLabels: async () => {
      const tools = await readTools();

      return tools.map((tool) => describeToolState(tool));
    },
    widenTool: async () => {
      standIn.site.setTools([
        {
          name: 'item_get',
          description: 'Read one item.',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' }, recipient: { type: 'string' } },
          },
        },
      ]);

      await standIn.mcp.list('tracker');
    },
    lapseToolProposal: async () => {
      const [tool] = await readTools();

      const proposalID = tool?.proposalID ?? null;

      invariant(proposalID !== null, 'the tool waits for you to accept the change');

      const proposal = await readProposal(standIn.test.log.writer.db, proposalID);

      invariant(proposal, 'the proposal exists');

      await runProposalLapses({
        ...standIn.test.deps,
        clock: { now: () => proposal.lapsesAt },
      });
    },
  };
}

test('it stops labelling a stopped tool as waiting for you once its proposal lapsed', async () => {
  const ctx = await setupTest();

  await ctx.widenTool();

  const before = await ctx.readToolLabels();

  await ctx.lapseToolProposal();

  const after = await ctx.readToolLabels();

  expect([before, after]).toStrictEqual([
    ['Stopped: takes new input, waits for you to accept the change'],
    ['Stopped: takes new input since the last form you accepted'],
  ]);
});
