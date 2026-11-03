import { expect, test } from 'bun:test';
import { buildResumeAtPlan } from './build-resume-at-plan';

test('it resumes after the first of 2 finished turns', () => {
  expect(buildResumeAtPlan('later-turn')).toStrictEqual({
    prompts: [
      'The code word is APPLE. Reply with OK only.',
      'The code word is now BANANA. Reply with OK only.',
    ],
    isLastTurnAborted: false,
    boundaryTurn: 1,
  });
});

test('it resumes after the first turn when the second is aborted', () => {
  expect(buildResumeAtPlan('aborted-turn')).toStrictEqual({
    prompts: [
      'The code word is APPLE. Reply with OK only.',
      'The code word is now CHERRY. Write a 300-word story that uses it, then confirm.',
    ],
    isLastTurnAborted: true,
    boundaryTurn: 1,
  });
});

test('it resumes at the second turn of a session that a compaction ends', () => {
  const plan = buildResumeAtPlan('compacted-turn');

  expect(plan.prompts).toHaveLength(4);
  expect(plan.prompts.at(-1)).toBe('/compact');
  expect(plan.isLastTurnAborted).toBeFalse();
  expect(plan.boundaryTurn).toBe(2);
});
