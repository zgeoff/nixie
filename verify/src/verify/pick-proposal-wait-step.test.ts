import { expect, test } from 'bun:test';
import { pickProposalWaitStep } from './pick-proposal-wait-step';

test.each([
  {
    name: 'accepts a match',
    input: { refusal: null, waitMs: 5000, startedAtMs: 0, nowMs: 100 },
    step: { kind: 'accept' },
  },
  {
    name: 'sleeps the poll interval on a mismatch before the deadline',
    input: { refusal: 'none held', waitMs: 5000, startedAtMs: 0, nowMs: 100 },
    step: { kind: 'sleep', sleepMs: 200 },
  },
  {
    name: 'sleeps only up to the deadline',
    input: { refusal: 'none held', waitMs: 1, startedAtMs: 0, nowMs: 0 },
    step: { kind: 'sleep', sleepMs: 1 },
  },
  {
    name: 'fails a mismatch at the deadline',
    input: { refusal: 'none held', waitMs: 1000, startedAtMs: 0, nowMs: 1000 },
    step: { kind: 'fail' },
  },
  {
    name: 'fails a mismatch with no wait',
    input: { refusal: 'none held', waitMs: undefined, startedAtMs: 0, nowMs: 0 },
    step: { kind: 'fail' },
  },
  {
    name: 'fails a mismatch with no wait when the clock moved back',
    input: { refusal: 'none held', waitMs: undefined, startedAtMs: 1000, nowMs: 500 },
    step: { kind: 'fail' },
  },
])('#pickProposalWaitStep $name', (row) => {
  expect(pickProposalWaitStep(row.input)).toStrictEqual(row.step);
});
