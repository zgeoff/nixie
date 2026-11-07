import type { StepResult, TaskLimits } from '@heynixie/tasks';

export interface TaskTurnEndFacts {
  // the task's counts before the turn
  readonly used: TaskLimits;

  readonly isBudgetReached: boolean;
  readonly spentDollars: number;
  readonly endedTurns: number;

  // null for a step that threw
  readonly next: StepResult['next'] | null;
}

export interface TaskTurnEndPlan {
  // the counts the task pauses at, or null when the turn reached no limit
  readonly reached: TaskLimits | null;

  readonly isImpReleased: boolean;
}

// A step with work left runs again soon on the same imp, so only a step that waits or pauses its
// task sleeps it. A step that threw after its calls reached the budget pauses too, so its retry
// waits for a raise in place of spending again.
export function planTaskTurnEnd(facts: TaskTurnEndFacts): TaskTurnEndPlan {
  const reached = facts.isBudgetReached
    ? {
        turns: facts.used.turns + facts.endedTurns,
        dollars: facts.used.dollars + facts.spentDollars,
      }
    : null;

  return { reached, isImpReleased: facts.next === 'wait' || reached !== null };
}
