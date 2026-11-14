import type { StepResult } from '@heynixie/tasks';

export interface TaskTurnEndFacts {
  readonly isBudgetReached: boolean;
  readonly spentDollars: number;

  // whether the user asked to pause the task, so the step's commit pauses it
  readonly isPauseRequested: boolean;

  // null for a step that threw
  readonly next: StepResult['next'] | null;
}

export interface TaskTurnEndPlan {
  // whether the turn reached the dollar limit, which the commit's end of the task run records
  readonly isLimitReached: boolean;

  // the dollars of a step that threw, which commits no turn record, or null when it spent none
  readonly failedDollars: number | null;

  // the dollars of a completed turn, which only its commit counts, or null when it spent none
  readonly commitDollars: number | null;

  // the dollars of a completed turn that reached the limit, which its commit counts beside its
  // turn record, because the record prices only the calls that finished, or null for any other turn
  readonly limitDollars: number | null;

  readonly isImpReleased: boolean;
}

// A step with work left runs again soon on the same imp, so only a step whose commit leaves its
// task waiting or paused sleeps it.
export function planTaskTurnEnd(facts: TaskTurnEndFacts): TaskTurnEndPlan {
  const spentDollars = facts.spentDollars > 0 ? facts.spentDollars : null;

  return {
    isLimitReached: facts.isBudgetReached,
    failedDollars: facts.next === null ? spentDollars : null,
    commitDollars: facts.next === null ? null : spentDollars,
    limitDollars: facts.next === null || !facts.isBudgetReached ? null : spentDollars,
    isImpReleased: facts.next === 'wait' || facts.isBudgetReached || facts.isPauseRequested,
  };
}
