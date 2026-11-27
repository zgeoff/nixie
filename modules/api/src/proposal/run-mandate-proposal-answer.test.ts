import { expect, test } from 'bun:test';
import { readActiveMandates } from '@heynixie/definitions';
import invariant from 'tiny-invariant';
import { startTestRules } from '../test-utils';
import { runMandateProposalAnswer } from './run-mandate-proposal-answer';

async function setupTest() {
  const rules = await startTestRules();

  return {
    ...rules,
    approveHeld: () => runMandateProposalAnswer(rules.context, () => Promise.resolve()),
    readActive: () => readActiveMandates(rules.log.writer.db),
  };
}

test('it approves a mandate proposal that waits for a passkey on the page, and the mandate starts', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Sends with a condition',
    rules: [
      {
        outcome: 'allow',
        tools: ['test.send'],
        cel: 'args.account == "work"',
        note: 'Work mail only.',
      },
    ],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  const answers = await ctx.approveHeld();
  const active = await ctx.readActive();

  expect([answers, active.map((mandate) => mandate.mandateID)]).toStrictEqual([
    { approved: 1, refused: [] },
    [proposed.mandateID],
  ]);
});

test('it approves nothing when no mandate proposal waits', async () => {
  const ctx = await setupTest();
  const answers = await ctx.approveHeld();

  expect(answers).toStrictEqual({ approved: 0, refused: [] });
});
