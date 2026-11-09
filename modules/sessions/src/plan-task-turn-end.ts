import type { StepResult, TaskLimits } from '@heynixie/tasks';

export interface TaskTurnEndFacts {
  // the task's counts before the turn
  readonly used: TaskLimits;

  readonly isBudgetReached: boolean;
  readonly spentDollars: number;
  readonly endedTurns: number;

  // whether one of the step's turns ended at the model's own end_turn
  readonly hasFinishedTurn: boolean;

  // null for a step that threw
  readonly next: StepResult['next'] | null;
}

export interface TaskTurnEndPlan {
  // the counts the task pauses at, or null when the turn reached no limit
  readonly reached: TaskLimits | null;

  readonly isImpReleased: boolean;

  // whether the budget cut a turn short, so its task resumes that work once a raise lets it
  readonly isWorkCut: boolean;
}

// A step with work left runs again soon on the same imp, so only a step that waits or pauses its
// task sleeps it. A step that threw keeps its input for its retry, so its work counts as no cut.
export function planTaskTurnEnd(facts: TaskTurnEndFacts): TaskTurnEndPlan {
  const reached = facts.isBudgetReached
    ? {
        turns: facts.used.turns + facts.endedTurns,
        dollars: facts.used.dollars + facts.spentDollars,
      }
    : null;

  return {
    reached,
    isImpReleased: facts.next === 'wait' || reached !== null,
    isWorkCut: reached !== null && facts.next !== null && !facts.hasFinishedTurn,
  };
}
