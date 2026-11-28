import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { seedTrustedServerProposal } from '../test-utils/seed-trusted-server-proposal';
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
    seed: {
      trustedServerProposal: () =>
        seedTrustedServerProposal(mcp.context, 'calendar', buildServerFacts()),
    },
    answer: mcp.answer,
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

test('it approves a server proposal that was stored with a trusted flag in its facts', async () => {
  const ctx = await setupTest();
  const proposalID = await ctx.seed.trustedServerProposal();
  const answered = await ctx.answer(proposalID, 'approve');

  expect(answered).toStrictEqual({
    status: 'answered',
    result: { proposalID, state: 'approved' },
  });
});
