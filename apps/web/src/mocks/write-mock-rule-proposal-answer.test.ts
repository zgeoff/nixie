import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockRuleProposalAnswer } from './write-mock-rule-proposal-answer';

test('it marks a pending rule change approved', async () => {
  await store.ruleProposals.create({ proposalID: 'p7rk2m9x4q' });

  const result = await writeMockRuleProposalAnswer({ answer: 'approve', proposalID: 'p7rk2m9x4q' });

  const stored = store.ruleProposals.findFirst((query) =>
    query.where({ proposalID: 'p7rk2m9x4q' }),
  );

  expect({ result, status: stored?.status }).toStrictEqual({
    result: { status: 'answered', proposalID: 'p7rk2m9x4q' },
    status: 'approved',
  });
});

test('it refuses an answer to a rule change it has no record of', async () => {
  const result = await writeMockRuleProposalAnswer({ answer: 'approve', proposalID: 'p-missing' });

  expect(result).toStrictEqual({ status: 'refused', code: 'NOT_FOUND' });
});

test('it refuses an answer to a rule change you answered', async () => {
  await store.ruleProposals.create({ proposalID: 'p7rk2m9x4q', status: 'rejected' });

  const result = await writeMockRuleProposalAnswer({ answer: 'approve', proposalID: 'p7rk2m9x4q' });

  expect(result).toStrictEqual({ status: 'refused', code: 'PROPOSAL_CLOSED' });
});

test('it refuses an answer to a rule change past its lapse time', async () => {
  await store.ruleProposals.create({ proposalID: 'p7rk2m9x4q', lapseAt: new Date(2000, 0, 1) });

  const result = await writeMockRuleProposalAnswer({
    answer: 'reject',
    proposalID: 'p7rk2m9x4q',
    reason: 'Too late.',
  });

  expect(result).toStrictEqual({ status: 'refused', code: 'PROPOSAL_CLOSED' });
});
