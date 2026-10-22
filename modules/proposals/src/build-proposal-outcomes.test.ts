import { expect, test } from 'bun:test';
import { buildProposalOutcomes } from './build-proposal-outcomes';

test('it maps each closing record kind to the outcome it records', () => {
  expect(
    buildProposalOutcomes({
      approved: 'test.proposal_approved',
      rejected: 'test.proposal_rejected',
      lapsed: 'test.proposal_lapsed',
    }),
  ).toStrictEqual(
    new Map([
      ['test.proposal_approved', 'approved'],
      ['test.proposal_rejected', 'rejected'],
      ['test.proposal_lapsed', 'lapsed'],
    ]),
  );
});
