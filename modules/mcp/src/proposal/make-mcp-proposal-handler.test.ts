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

  // a form that widens the input stops the tool and waits for an accept
  await mcp.list('tracker', {
    forms: [
      buildToolForm({
        description: 'Read one item and say who owns it.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, owner: { type: 'string' } },
          required: ['id'],
        },
      }),
    ],
  });

  return {
    readBodies: async () => {
      const rows = await readOpenProposals(mcp.log.writer.db, mcp.context.now());

      return makeMcpProposalHandler(mcp.context).readBodies(mcp.log.writer.db, rows);
    },
  };
}

test('it reads the card of an accept with the form the listing held', async () => {
  const ctx = await setupTest();
  const bodies = await ctx.readBodies();

  expect([...bodies.values()].map((body) => body?.fields['newForm'])).toStrictEqual([
    expect.stringContaining('"description":"Read one item and say who owns it."'),
  ]);
});
