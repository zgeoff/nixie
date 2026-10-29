import { expect, test } from 'bun:test';
import { pickSensitiveReview } from './pick-sensitive-review';

test('it sends a passing new sensitive write to review with its checks and its evidence', () => {
  expect(
    pickSensitiveReview(
      { target: null, isSensitive: true },
      {
        status: 'pass',
        source: 'owner',
        evidence: { recordSequence: 7, start: 0, end: 24 },
        checks: { quote: 'pass' },
      },
    ),
  ).toStrictEqual({
    status: 'review',
    reason: 'sensitive',
    evidence: { recordSequence: 7, start: 0, end: 24 },
    checks: { quote: 'pass' },
    checkerReason: null,
  });
});

test('it passes a new write with no mark as the gate passed it', () => {
  expect(
    pickSensitiveReview(
      { target: null },
      { status: 'pass', source: 'owner', evidence: null, checks: { quote: 'pass' } },
    ),
  ).toStrictEqual({ status: 'pass', source: 'owner', evidence: null, checks: { quote: 'pass' } });
});

test('it passes a sensitive edit as the gate passed it, because a mark applies only to a new item', () => {
  expect(
    pickSensitiveReview(
      { target: { itemID: '3f8a1c27-9b4e-4d61-a2c5-7e0d9b3f1a48', version: 2 }, isSensitive: true },
      { status: 'pass', source: 'owner', evidence: null, checks: { quote: 'pass' } },
    ),
  ).toStrictEqual({ status: 'pass', source: 'owner', evidence: null, checks: { quote: 'pass' } });
});

test('it keeps the review reason of a sensitive write the gate already sent to review', () => {
  expect(
    pickSensitiveReview(
      { target: null, isSensitive: true },
      {
        status: 'review',
        reason: 'checker_not_asserted',
        evidence: null,
        checks: { quote: 'pass' },
        checkerReason: 'the message does not say it',
      },
    ),
  ).toStrictEqual({
    status: 'review',
    reason: 'checker_not_asserted',
    evidence: null,
    checks: { quote: 'pass' },
    checkerReason: 'the message does not say it',
  });
});
