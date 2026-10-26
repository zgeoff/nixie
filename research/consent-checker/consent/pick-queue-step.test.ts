import { expect, test } from 'bun:test';
import { pickQueueStep } from './pick-queue-step.ts';

test.each([
  {
    label: 'a run under its budget and limit',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 1,
    costUSD: 0.5,
    limit: 2,
    step: { isStarting: true, isStoppedAtBudget: false },
  },
  {
    label: 'a run with no limit',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 40,
    costUSD: 0.5,
    limit: null,
    step: { isStarting: true, isStoppedAtBudget: false },
  },
  {
    label: 'a run whose spend reaches the budget',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 1,
    costUSD: 4,
    limit: 2,
    step: { isStarting: false, isStoppedAtBudget: true },
  },
  {
    label: 'a run whose next reservation would pass the budget',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 1,
    costUSD: 3.5,
    limit: 2,
    step: { isStarting: false, isStoppedAtBudget: true },
  },
  {
    label: 'a run whose next reservation uses the rest of the budget',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 1,
    costUSD: 3,
    limit: 2,
    step: { isStarting: true, isStoppedAtBudget: false },
  },
  {
    label: 'a run that reaches its limit',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 2,
    costUSD: 0.5,
    limit: 2,
    step: { isStarting: false, isStoppedAtBudget: false },
  },
  {
    label: 'a run that reaches its limit and its budget',
    hasErrored: false,
    isStoppedByFailure: false,
    started: 2,
    costUSD: 4,
    limit: 2,
    step: { isStarting: false, isStoppedAtBudget: false },
  },
  {
    label: 'a run an output with no answer stopped',
    hasErrored: false,
    isStoppedByFailure: true,
    started: 1,
    costUSD: 4,
    limit: 2,
    step: { isStarting: false, isStoppedAtBudget: false },
  },
  {
    label: 'a run a worker error stopped',
    hasErrored: true,
    isStoppedByFailure: false,
    started: 1,
    costUSD: 4,
    limit: 2,
    step: { isStarting: false, isStoppedAtBudget: false },
  },
])('it picks the next step for $label', (row) => {
  expect(
    pickQueueStep(
      {
        result: {
          ran: row.started,
          costUSD: row.costUSD,
          isStoppedAtBudget: false,
          isStoppedByFailure: row.isStoppedByFailure,
        },
        started: row.started,
        hasErrored: row.hasErrored,
      },
      { reserveUSD: 1, budgetUSD: 4, limit: row.limit },
    ),
  ).toStrictEqual(row.step);
});
