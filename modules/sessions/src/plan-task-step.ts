import type { StepResult, TaskLimits } from '@heynixie/tasks';
import type { HarnessCapability } from '@heynixie/wire';

export interface TaskStepFacts {
  readonly used: TaskLimits;
  readonly limits: TaskLimits;
  readonly isImpAwake: boolean;

  // what a task needs that its profile's harness lacks
  readonly missing: readonly HarnessCapability[];
}

export type TaskStepPlan =
  | { readonly kind: 'refuse'; readonly missing: readonly HarnessCapability[] }
  | { readonly kind: 'pause'; readonly isImpReleased: boolean }
  | { readonly kind: 'run' };

// A task at either limit runs no turn. A turn that stopped at the compaction threshold leaves its
// imp awake, and a held task may wait long for its raise, so the pause sleeps that imp.
export function planTaskStep(facts: TaskStepFacts): TaskStepPlan {
  if (facts.missing.length > 0) {
    return { kind: 'refuse', missing: facts.missing };
  }

  const isAtLimit =
    facts.used.turns >= facts.limits.turns || facts.used.dollars >= facts.limits.dollars;

  return isAtLimit ? { kind: 'pause', isImpReleased: facts.isImpAwake } : { kind: 'run' };
}

// A step with work left runs again soon on the same imp, so only a step that waits sleeps it.
export function isImpReleasedAfterStep(result: Pick<StepResult, 'next'>): boolean {
  return result.next === 'wait';
}
