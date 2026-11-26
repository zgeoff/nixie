import type { StepResult } from '@heynixie/tasks';

export interface TaskTurnEndFacts {
  // whether the turn reached the dollar limit: the budget's calls did, or the gateway's sandbox
  // refused a request
  readonly isLimitReached: boolean;

  // whether the user asked to pause the task, so the step's commit pauses it
  readonly isPauseRequested: boolean;

  // null for a step that threw
  readonly next: StepResult['next'] | null;
}

export interface TaskTurnEndPlan {
  // whether the commit's end of the task run records the dollar limit
  readonly isLimitReached: boolean;

  readonly isImpReleased: boolean;
}

// A step with work left runs again soon on the same imp, so only a step whose commit leaves its
// task waiting or paused sleeps it.
export function planTaskTurnEnd(facts: TaskTurnEndFacts): TaskTurnEndPlan {
  return {
    isLimitReached: facts.isLimitReached,
    isImpReleased: facts.next === 'wait' || facts.isLimitReached || facts.isPauseRequested,
  };
}
