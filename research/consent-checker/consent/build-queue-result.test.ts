import { expect, test } from 'bun:test';
import { buildQueueResult } from './build-queue-result.ts';

test('it replaces the reservation of an answered output with its cost and counts it', () => {
  expect(
    buildQueueResult(
      { ran: 2, costUSD: 0.6, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0.25, failure: null },
      0.1,
    ),
  ).toStrictEqual({ ran: 3, costUSD: 0.75, isStoppedAtBudget: false, isStoppedByFailure: false });
});

test('it counts an output whose answer failed to parse as ran', () => {
  expect(
    buildQueueResult(
      { ran: 2, costUSD: 0.6, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0.25, failure: 'unparsed' },
      0.1,
    ),
  ).toStrictEqual({ ran: 3, costUSD: 0.75, isStoppedAtBudget: false, isStoppedByFailure: false });
});

test('it keeps the cost of an output with no answer, does not count it, and stops the run', () => {
  expect(
    buildQueueResult(
      { ran: 2, costUSD: 0.6, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0.25, failure: 'no_output', failureReason: 'error_max_turns' },
      0.1,
    ),
  ).toStrictEqual({
    ran: 2,
    costUSD: 0.75,
    isStoppedAtBudget: false,
    isStoppedByFailure: true,
    failureReason: 'error_max_turns',
  });
});

test('it keeps the reservation of an output with no known cost', () => {
  expect(
    buildQueueResult(
      { ran: 0, costUSD: 0.6, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: null, failure: 'no_output' },
      0.1,
    ),
  ).toStrictEqual({ ran: 0, costUSD: 0.6, isStoppedAtBudget: false, isStoppedByFailure: true });
});
