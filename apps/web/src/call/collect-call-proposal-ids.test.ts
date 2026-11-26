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

test('#collectCallProposalIDs keeps every open proposal and drops the oldest settled ones past 100', () => {
  const settled = Array.from({ length: 150 }, (_, index) => `s${String(index)}`);
  const open = Array.from({ length: 120 }, (_, index) => `o${String(index)}`);

  const ids = collectCallProposalIDs(
    [...open.slice(0, 60), ...settled, ...open.slice(60)],
    open.map((proposalID) => ({ proposal: { proposalID, thread: 't1' } })),
    't1',
  );

  expect({
    open: ids.filter((id) => id.startsWith('o')).length,
    settled: ids.filter((id) => id.startsWith('s')),
  }).toStrictEqual({ open: 120, settled: settled.slice(50) });
});
