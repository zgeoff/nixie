import { expect, test } from 'bun:test';
import { startTestLog } from '@heynixie/log/test-utils';
import { readRuleProposals } from '../rule/read-rule-proposals';
import { seedLegacyRuleProposal } from './seed-legacy-rule-proposal';

async function setupTest() {
  const started = await startTestLog();

  return { ...started, readProposals: () => readRuleProposals(started.writer.db) };
}

test('it writes a pending proposal with one effect removal by default', async () => {
  const ctx = await setupTest();

  await seedLegacyRuleProposal(ctx.log);

  const proposals = await ctx.readProposals();

  expect(proposals).toStrictEqual([
    {
      proposal: {
        proposalID: 'legacy-proposal',
        proposalHash: 'sha256:legacy-proposal',
        changes: [],
        effectChanges: [{ tool: 'web.fetch', remove: ['send'] }],
        budgetChanges: [],
      },
      proposedAt: expect.any(Number),
      lapseAt: expect.any(Number),
      outcome: null,
    },
  ]);
});

test('it applies the overrides it takes', async () => {
  const ctx = await setupTest();

  await seedLegacyRuleProposal(ctx.log, { proposalID: 'p-harbour', effectChanges: [] });

  const [state] = await ctx.readProposals();

  expect(state?.proposal).toStrictEqual({
    proposalID: 'p-harbour',
    proposalHash: 'sha256:legacy-proposal',
    changes: [],
    effectChanges: [],
    budgetChanges: [],
  });
});
