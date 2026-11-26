import { expect, test } from 'bun:test';
import { collectActionProposals } from './collect-action-proposals';

test('it reads the tool of a held call from the ask record, after the shared record that opened its row', () => {
  const held = collectActionProposals(
    [{ proposal: { proposalID: 'b1d2', kind: 'action' } }],
    [
      { kind: 'proposals.proposed', payload: { proposalID: 'b1d2', family: 'action' } },
      { kind: 'policy.action_proposed', payload: { proposalID: 'b1d2', tool: 'test.send' } },
    ],
  );

  expect(held).toStrictEqual([{ proposalID: 'b1d2', tool: 'test.send' }]);
});

test('it leaves out a proposal that is no held call', () => {
  const held = collectActionProposals(
    [{ proposal: { proposalID: 'c3e4', kind: 'memory_write' } }],
    [{ kind: 'policy.action_proposed', payload: { proposalID: 'c3e4', tool: 'test.send' } }],
  );

  expect(held).toStrictEqual([]);
});

test('it leaves out a held call whose ask record is gone', () => {
  const held = collectActionProposals(
    [{ proposal: { proposalID: 'd5f6', kind: 'action' } }],
    [{ kind: 'proposals.proposed', payload: { proposalID: 'd5f6', family: 'action' } }],
  );

  expect(held).toStrictEqual([]);
});
