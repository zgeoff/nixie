import type { WakeRule } from '../types';
import { buildTargetTaskID } from './build-target-task-id';
import { isWakeRuleReady } from './is-wake-rule-ready';
import type { LiveWakeRule } from './read-live-wake-rules';

export interface ArrivalTarget {
  readonly targetTaskID: string;

  // every matching rule of the target
  readonly rules: readonly WakeRule[];

  // true when a matching rule is ready, so the target wakes with the arrival
  readonly isNow: boolean;
}

// One entry per target: it wakes at once when one of its matching rules is ready, and otherwise the
// match is held. A rule that is not ready joins a wake without causing it.
export function pickArrivalPlan(matches: readonly LiveWakeRule[], nowMs: number): ArrivalTarget[] {
  const targets = new Map<string, LiveWakeRule[]>();

  for (const match of matches) {
    const taskID = buildTargetTaskID(match.rule.target);

    targets.set(taskID, [...(targets.get(taskID) ?? []), match]);
  }

  return [...targets].map(([targetTaskID, entries]) => ({
    targetTaskID,
    rules: entries.map((entry) => entry.rule),
    isNow: entries.some((entry) => isWakeRuleReady(entry, nowMs)),
  }));
}
