import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readProposal } from '@heynixie/proposals';
import { startShortIDDraws } from '@heynixie/proposals/test-utils';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { writeMcpProposal } from './write-mcp-proposal';

async function setupTest() {
  const mcp = await startTestMcp();

  return {
    propose: async (serverID: string) => {
      const proposalID = await withWriteTransaction(mcp.log.writer, (tx) =>
        writeMcpProposal(tx, mcp.context, {
          operation: { change: 'server', serverID, facts: buildServerFacts() },
          replacesProposalID: null,
        }),
      );

      const row = await readProposal(mcp.log.writer.db, proposalID);

      return row?.shortID;
    },
  };
}

test('it draws another short ID for an mcp proposal when the drawn one names an existing proposal', async () => {
  const ctx = await setupTest();

  startShortIDDraws(['dup', 'dup', 'fresh']);

  const first = await ctx.propose('tracker');
  const second = await ctx.propose('calendar');

  expect([first, second]).toStrictEqual(['dup', 'fresh']);
});
