import { expect, test } from 'bun:test';
import { buildQueueResult } from './build-queue-result.ts';

test('it counts an answered output and adds its cost', () => {
  expect(
    buildQueueResult(
      { ran: 2, costUSD: 0.5, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0.25, failure: null },
    ),
  ).toStrictEqual({ ran: 3, costUSD: 0.75, isStoppedAtBudget: false, isStoppedByFailure: false });
});

test('it counts an output whose answer failed to parse as ran', () => {
  expect(
    buildQueueResult(
      { ran: 2, costUSD: 0.5, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0.25, failure: 'unparsed' },
    ),
  ).toStrictEqual({ ran: 3, costUSD: 0.75, isStoppedAtBudget: false, isStoppedByFailure: false });
});

test('it keeps the cost of an output with no answer, does not count it, and stops the run', () => {
  expect(
    buildQueueResult(
      { ran: 2, costUSD: 0.5, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0.25, failure: 'no_output', failureReason: 'error_max_turns' },
    ),
  ).toStrictEqual({
    ran: 2,
    costUSD: 0.75,
    isStoppedAtBudget: false,
    isStoppedByFailure: true,
    failureReason: 'error_max_turns',
  });
});

test('it stops the run with no reason when the output with no answer gives none', () => {
  expect(
    buildQueueResult(
      { ran: 0, costUSD: 0, isStoppedAtBudget: false, isStoppedByFailure: false },
      { costUSD: 0, failure: 'no_output' },
    ),
  ).toStrictEqual({ ran: 0, costUSD: 0, isStoppedAtBudget: false, isStoppedByFailure: true });
});
