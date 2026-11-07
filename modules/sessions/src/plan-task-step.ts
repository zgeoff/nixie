import type { TaskLimits } from '@heynixie/tasks';

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
