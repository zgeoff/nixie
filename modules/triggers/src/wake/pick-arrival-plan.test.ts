import { expect, test } from 'bun:test';
import type { WakeRule } from '../types';
import { pickArrivalPlan } from './pick-arrival-plan';

function setupTest() {
  const windowMs = 60_000;

  const buildEntry = (ruleID: string, taskID: string | null, lastWakeAt: number | null) => {
    const rule: WakeRule = {
      ruleID,
      shortID: `s-${ruleID}`,
      mailbox: { kind: 'mail' },
      match: {},
      target: taskID === null ? { kind: 'conversation' } : { kind: 'task', taskID },
      setBy: 'conversation',
      expiresAt: null,
      windowMs,
      origin: 'tool',
      createdAt: 0,
    };

    return { rule, lastWakeAt };
  };

  return { buildEntry };
}

test('#pickArrivalPlan wakes at once a target with a rule that never woke', () => {
  const ctx = setupTest();
  const plan = pickArrivalPlan([ctx.buildEntry('a', null, null)], 1000);

  expect(plan.map((target) => [target.targetTaskID, target.isNow])).toStrictEqual([
    ['conversation', true],
  ]);
});

test('#pickArrivalPlan holds the match of a target whose rules are inside their window', () => {
  const ctx = setupTest();
  const plan = pickArrivalPlan([ctx.buildEntry('a', 'task-1', 1000)], 2000);

  expect(plan.map((target) => [target.targetTaskID, target.isNow])).toStrictEqual([
    ['task-1', false],
  ]);
});

test('#pickArrivalPlan plans each target on its own', () => {
  const ctx = setupTest();

  const plan = pickArrivalPlan(
    [ctx.buildEntry('a', null, null), ctx.buildEntry('b', 'task-1', 1000)],
    2000,
  );

  expect(plan.map((target) => [target.targetTaskID, target.isNow])).toStrictEqual([
    ['conversation', true],
    ['task-1', false],
  ]);
});
