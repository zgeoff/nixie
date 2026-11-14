import { expect, test } from 'bun:test';
import { formatProposalOutcome } from './format-proposal-outcome';

test.each([
  ['lapsed', 'Nothing changed: this proposal lapsed before your answer.'],
  ['answered', 'Nothing changed: this proposal was already answered.'],
  ['moved', 'Nothing changed: the item changed after the proposal was made.'],
  ['changed', 'Nothing changed: this proposal changed after the list loaded.'],
  ['gone', 'Nothing changed: this proposal is gone.'],
] as const)('it describes a stale answer whose proposal %s', (cause, expected) => {
  expect(formatProposalOutcome({ cause, proposalID: 'proposal-a', status: 'stale' })).toBe(
    expected,
  );
});

test.each([
  ['CLIENT_ACTION_ID_REUSED', 'Nothing changed: this answer clashed with another one. Try again.'],
  ['PIN_EDIT', 'Nothing changed: a pin takes no edited text.'],
  ['PINNED_CORE_FULL', 'Nothing changed: the pinned core has no room for this item.'],
  ['RETIREMENT_EDIT', 'Nothing changed: a retirement takes no edited text.'],
  ['REVISION_TARGET', 'Nothing changed: that item cannot take this text as a revision.'],
  ['WRONG_STATE', 'Nothing changed: the item is in a state this answer cannot change.'],
] as const)('it describes an answer refused with %s', (code, expected) => {
  expect(formatProposalOutcome({ code, proposalID: 'proposal-a', status: 'refused' })).toBe(
    expected,
  );
});

test('it describes an approval held for a close match', () => {
  expect(
    formatProposalOutcome({
      item: { itemID: 'item-a', text: 'Keeps bees', version: 1 },
      proposalID: 'proposal-a',
      status: 'close_match',
    }),
  ).toBe('Nothing changed yet: an active item already says this.');
});

test.each(['applied', 'rejected'] as const)('it says nothing of an answer that %s', (status) => {
  expect(formatProposalOutcome({ proposalID: 'proposal-a', status })).toBeNull();
});
