import { expect, test } from 'bun:test';
import { buildMockProposalState } from './build-mock-proposal-state';

test('it builds a default proposal state', () => {
  expect(buildMockProposalState()).toStrictEqual({
    proposalID: expect.toBeString(),
    thread: expect.toBeString(),
    proposedAt: expect.toBeNumber(),
    outcome: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockProposalState({ thread: null, outcome: 'rejected' })).toStrictEqual({
    proposalID: expect.toBeString(),
    thread: null,
    proposedAt: expect.toBeNumber(),
    outcome: 'rejected',
  });
});
