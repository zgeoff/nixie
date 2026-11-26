import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { makeMcpProposalHandler } from './make-mcp-proposal-handler';

async function setupTest() {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());
  await mcp.list('tracker', { forms: [buildToolForm({ description: 'Read one item.' })] });

  return {
    readBodies: async () => {
      const rows = await readOpenProposals(mcp.log.writer.db, mcp.context.now());

      return makeMcpProposalHandler(mcp.context).readBodies(mcp.log.writer.db, rows);
    },
  };
}

test('it reads the card of an allow with the form the listing held', async () => {
  const ctx = await setupTest();
  const bodies = await ctx.readBodies();

  expect([...bodies.values()].map((body) => body?.fields['newForm'])).toStrictEqual([
    expect.stringContaining('"description":"Read one item."'),
  ]);
});
