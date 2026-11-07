import type { StepResult, TaskLimits } from '@heynixie/tasks';

export interface TaskStepFacts {
  readonly used: TaskLimits;
  readonly limits: TaskLimits;
  readonly isImpAwake: boolean;
}

export type TaskStepPlan =
  | { readonly kind: 'pause'; readonly isImpReleased: boolean }
  | { readonly kind: 'run' };

// A task at either limit runs no turn. A turn that stopped at the compaction threshold leaves its
// imp awake, and a held task may wait long for its raise, so the pause sleeps that imp.
export function planTaskStep(facts: TaskStepFacts): TaskStepPlan {
  const isAtLimit =
    facts.used.turns >= facts.limits.turns || facts.used.dollars >= facts.limits.dollars;

  return isAtLimit ? { kind: 'pause', isImpReleased: facts.isImpAwake } : { kind: 'run' };
}

export interface FinishedTaskStep {
  readonly next: StepResult['next'];

  // the step's turn reached a limit, so the task pauses after the step commits
  readonly isPaused: boolean;
}

// A step with work left runs again soon on the same imp, so only a step that waits or pauses its
// task sleeps it.
export function isImpReleasedAfterStep(step: FinishedTaskStep): boolean {
  return step.next === 'wait' || step.isPaused;
}
