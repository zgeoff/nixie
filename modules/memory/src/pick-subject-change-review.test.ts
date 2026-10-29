import { expect, test } from 'bun:test';
import { pickSubjectChangeReview } from './pick-subject-change-review';

test('it sends a passing subject change to review with its checks and its evidence', () => {
  expect(
    pickSubjectChangeReview('shared', {
      status: 'pass',
      source: 'owner',
      evidence: { recordSequence: 9, start: 4, end: 31 },
      checks: { quote: 'pass' },
    }),
  ).toStrictEqual({
    status: 'review',
    reason: 'subject_change',
    evidence: { recordSequence: 9, start: 4, end: 31 },
    checks: { quote: 'pass' },
    checkerReason: null,
  });
});

test('it passes a write that keeps its subject as the gate passed it', () => {
  expect(
    pickSubjectChangeReview(null, {
      status: 'pass',
      source: 'owner',
      evidence: null,
      checks: { quote: 'pass' },
    }),
  ).toStrictEqual({ status: 'pass', source: 'owner', evidence: null, checks: { quote: 'pass' } });
});

test("it keeps the gate's own reason for a subject change that the gate already sent to review", () => {
  expect(
    pickSubjectChangeReview('owner', {
      status: 'review',
      reason: 'no_quote',
      evidence: null,
      checks: { quote: 'fail' },
      checkerReason: null,
    }),
  ).toStrictEqual({
    status: 'review',
    reason: 'no_quote',
    evidence: null,
    checks: { quote: 'fail' },
    checkerReason: null,
  });
});
