import type { StepResult, TaskLimits } from '@heynixie/tasks';

export interface TaskTurnEndFacts {
  // the task's counts before the turn
  readonly used: TaskLimits;

  readonly isBudgetReached: boolean;
  readonly spentDollars: number;
  readonly endedTurns: number;

  // whether the user asked to pause the task, so the step's commit pauses it
  readonly isPauseRequested: boolean;

  // null for a step that threw
  readonly next: StepResult['next'] | null;
}

export interface TaskTurnEndPlan {
  // the counts the task pauses at, or null when the turn reached no limit
  readonly reached: TaskLimits | null;

  // the dollars of a step that threw, which commits no turn record, or null when it spent none
  readonly failedDollars: number | null;

  readonly isImpReleased: boolean;
}

// A step with work left runs again soon on the same imp, so only a step whose commit leaves its
// task waiting or paused sleeps it.
export function planTaskTurnEnd(facts: TaskTurnEndFacts): TaskTurnEndPlan {
  const reached = facts.isBudgetReached
    ? {
        turns: facts.used.turns + facts.endedTurns,
        dollars: facts.used.dollars + facts.spentDollars,
      }
    : null;

  return {
    reached,
    failedDollars: facts.next === null && facts.spentDollars > 0 ? facts.spentDollars : null,
    isImpReleased: facts.next === 'wait' || reached !== null || facts.isPauseRequested,
  };
}
