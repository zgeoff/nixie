import type { TaskLimits, TaskUsage } from '@heynixie/tasks';

export interface TaskStepFacts {
  readonly used: TaskUsage;
  readonly limits: TaskLimits;
  readonly isImpAwake: boolean;
}

export type TaskStepPlan =
  | {
      readonly kind: 'pause';

      // the meter that is at its limit, which the turns meter wins when both are
      readonly meter: 'turns' | 'dollars';
      readonly isImpReleased: boolean;
    }
  | { readonly kind: 'run' };

// A task at a limit it has runs no turn, and a meter with no limit never stops one. A turn that stopped at the compaction threshold leaves its
// imp awake, and a held task may wait long for its raise, so the pause sleeps that imp.
export function planTaskStep(facts: TaskStepFacts): TaskStepPlan {
  if (facts.limits.turns !== null && facts.used.turns >= facts.limits.turns) {
    return { kind: 'pause', meter: 'turns', isImpReleased: facts.isImpAwake };
  }

  return facts.limits.dollars !== null && facts.used.dollars >= facts.limits.dollars
    ? { kind: 'pause', meter: 'dollars', isImpReleased: facts.isImpAwake }
    : { kind: 'run' };
}
