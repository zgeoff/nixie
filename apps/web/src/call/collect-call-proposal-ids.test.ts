import { expect, test } from 'bun:test';
import { collectCallProposalIDs } from './collect-call-proposal-ids';

test('#collectCallProposalIDs adds the proposals of the call thread and none of another thread', () => {
  const ids = collectCallProposalIDs(
    [],
    [
      { proposal: { proposalID: 'p1', thread: 't1' } },
      { proposal: { proposalID: 'p2', thread: 'conversation' } },
      { proposal: { proposalID: 'p3', thread: null } },
    ],
    't1',
  );

  expect(ids).toStrictEqual(['p1']);
});

test('#collectCallProposalIDs keeps a proposal that left the list, once, in the order seen', () => {
  const ids = collectCallProposalIDs(
    ['p1'],
    [
      { proposal: { proposalID: 'p2', thread: 't1' } },
      { proposal: { proposalID: 'p2', thread: 't1' } },
    ],
    't1',
  );

  expect(ids).toStrictEqual(['p1', 'p2']);
});
