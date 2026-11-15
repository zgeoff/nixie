import { expect, test } from 'bun:test';
import { canProposeRule } from './can-propose-rule';

function setupTest() {
  return {
    ready: {
      now: 1000,
      approvals: 3,
      approvedCount: 3,
      declinedCount: 0,
      hasOpenProposal: false,
      quietUntil: null,
    },
  };
}

test('it proposes once the approvals are in, with no decline, no open proposal and no quiet time', () => {
  const ctx = setupTest();

  expect(canProposeRule(ctx.ready)).toBeTrue();
});

test.each([
  ['too few approvals', { approvedCount: 2 }],
  ['a declined answer', { declinedCount: 1 }],
  ['an open proposal', { hasOpenProposal: true }],
  ['a quiet time ahead', { quietUntil: 2000 }],
  ['a quiet time that ends now', { quietUntil: 1000 }],
])('it proposes nothing with %s', (_name, change) => {
  const ctx = setupTest();

  expect(canProposeRule({ ...ctx.ready, ...change })).toBeFalse();
});

test('it proposes once the quiet time is past', () => {
  const ctx = setupTest();

  expect(canProposeRule({ ...ctx.ready, quietUntil: 999 })).toBeTrue();
});
