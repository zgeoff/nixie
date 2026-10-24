import { expect, test } from 'bun:test';
import { buildStepRunID } from './build-step-run-id';
import { parseStepRunID } from './parse-step-run-id';

test('it reads back the step key and the lease generation that a step run ID holds', () => {
  const stepRunID = buildStepRunID({
    stepKey: 'planner:4',
    lease: {
      kind: 'task',
      workID: 'planner',
      holder: 'runner-a',
      generation: 3,
      epoch: 1,
      expiresAt: 1_060_000,
    },
    wake: { hop: 0, cause: { kind: 'owner' } },
  });

  expect(parseStepRunID(stepRunID)).toStrictEqual({ stepKey: 'planner:4', generation: 3 });
});

test.each([
  ['no generation', 'planner:4'],
  ['an empty step key', '@3'],
  ['a generation that is not a number', 'planner:4@three'],
  ['a generation of 0', 'planner:4@0'],
  ['an empty generation', 'planner:4@'],
])('it reads a step run ID with %s as no step', (_label, stepRunID) => {
  expect(parseStepRunID(stepRunID)).toBeNull();
});
