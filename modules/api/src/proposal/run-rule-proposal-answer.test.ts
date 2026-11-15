import { expect, test } from 'bun:test';
import { readActiveMandates } from '@heynixie/definitions';
import invariant from 'tiny-invariant';
import { startTestRules } from '../test-utils/start-test-rules';
import { runRuleProposalAnswer } from './run-rule-proposal-answer';

async function setupTest() {
  const rules = await startTestRules();

  const errors: Parameters<typeof runRuleProposalAnswer>[2] = {
    NOT_FOUND: (options) => Object.assign(new Error(options.message), { code: 'NOT_FOUND' }),
    PROPOSAL_CLOSED: (options) =>
      Object.assign(new Error(options.message), { code: 'PROPOSAL_CLOSED' }),
  };

  return {
    ...rules,
    approveFromHost: (proposalID: string) =>
      runRuleProposalAnswer(rules.rulesContext, { answer: 'approve', proposalID }, errors),
    readActive: () => readActiveMandates(rules.log.writer.db),
  };
}

test('it refuses to approve a mandate from the host rule route, which takes no passkey', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Full authority over my test sends',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  const approval = ctx.approveFromHost(proposed.proposalID);

  await Promise.allSettled([approval]);

  expect(approval).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('it starts no mandate when the host rule route refuses it', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Full authority over my test sends',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  await Promise.allSettled([ctx.approveFromHost(proposed.proposalID)]);

  const active = await ctx.readActive();

  expect(active).toStrictEqual([]);
});
