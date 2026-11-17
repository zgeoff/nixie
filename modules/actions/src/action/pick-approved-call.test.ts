import { expect, test } from 'bun:test';
import type { ApprovedCallFacts } from './pick-approved-call';
import { pickApprovedCall } from './pick-approved-call';

function setupTest() {
  return {
    pick: (overrides: Partial<ApprovedCallFacts>) =>
      pickApprovedCall({
        status: 'failed',
        reason: 'rule_denied',
        isCancelled: false,
        outcomeMessage: null,
        resultMessage: null,
        ...overrides,
      }),
  };
}

test('it maps a done action to applied', () => {
  const ctx = setupTest();

  expect(ctx.pick({ status: 'done', reason: null })).toStrictEqual({
    state: 'applied',
    reason: null,
  });
});

test('it maps an unknown action to unknown', () => {
  const ctx = setupTest();

  expect(ctx.pick({ status: 'unknown', reason: 'ambiguous' })).toStrictEqual({
    state: 'unknown',
    reason: null,
  });
});

test('it maps a pending action to waiting', () => {
  const ctx = setupTest();

  expect(ctx.pick({ status: 'pending', reason: null })).toStrictEqual({
    state: 'waiting',
    reason: null,
  });
});

test('it maps a pending action that a stop cancelled to failed', () => {
  const ctx = setupTest();

  expect(ctx.pick({ status: 'pending', reason: null, isCancelled: true })).toStrictEqual({
    state: 'failed',
    reason: 'the task was stopped before it ran',
  });
});

test('it gives the outcome message as the reason of a failed action', () => {
  const ctx = setupTest();

  expect(ctx.pick({ outcomeMessage: 'no such recipient', resultMessage: 'other' })).toStrictEqual({
    state: 'failed',
    reason: 'no such recipient',
  });
});

test('it gives the result error text when the outcome has no message', () => {
  const ctx = setupTest();

  expect(ctx.pick({ resultMessage: 'the query was empty' })).toStrictEqual({
    state: 'failed',
    reason: 'the query was empty',
  });
});

test('it gives the sentence for the reason code when both messages are gone', () => {
  const ctx = setupTest();

  expect(ctx.pick({})).toStrictEqual({ state: 'failed', reason: 'a rule denied it' });
});

test('it cuts a long reason to 300 characters', () => {
  const ctx = setupTest();

  expect(ctx.pick({ outcomeMessage: 'x'.repeat(500) })).toStrictEqual({
    state: 'failed',
    reason: 'x'.repeat(300),
  });
});
