import { expect, test } from 'bun:test';
import { readMockRuleProposals } from './read-mock-rule-proposals';
import { store } from './store';

test('it reads only the rule changes that are pending and inside their lapse time', async () => {
  await store.ruleProposals.create({ proposalID: 'p-open', lapseAt: new Date(2099, 0, 1) });
  await store.ruleProposals.create({ proposalID: 'p-answered', status: 'approved' });
  await store.ruleProposals.create({ proposalID: 'p-lapsed', lapseAt: new Date(2000, 0, 1) });

  const proposals = readMockRuleProposals();

  expect(proposals.map((proposal) => proposal.proposalID)).toStrictEqual(['p-open']);
});
