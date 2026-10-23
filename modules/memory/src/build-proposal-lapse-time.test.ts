import { expect, test } from 'bun:test';
import { buildProposalLapseTime } from './build-proposal-lapse-time';

test('it lapses a proposal with no end time at the end of the lapse window', () => {
  expect(buildProposalLapseTime(1000, { proposalLapseMs: 500 }, null)).toBe(1500);
});

test('it lapses a proposal at its end time when that comes first', () => {
  expect(buildProposalLapseTime(1000, { proposalLapseMs: 500 }, 1200)).toBe(1200);
});

test('it lapses a proposal at the end of the lapse window when its end time comes later', () => {
  expect(buildProposalLapseTime(1000, { proposalLapseMs: 500 }, 9000)).toBe(1500);
});
