import type { TaskHolds, TaskState } from '../types';

// Why the user's own action holds every fire of a definition until the user acts again.
export type DefinitionHold = 'stopped' | 'paused' | 'limit';

export interface DefinitionHoldFacts {
  readonly holds: TaskHolds;
  readonly state: TaskState;

  // whether the user's newest pause request waited on the step that failed the task, so no
  // task.paused, restart or revival answered it
  readonly isPauseUnanswered: boolean;
}

// A failed task holds no fire of its own, so one failed task run never stops the schedule. Nixie's
// pause and the spending stop hold every task, so they are no hold of the definition's.
export function pickDefinitionHold(facts: DefinitionHoldFacts): DefinitionHold | null {
  const isFailed = facts.state === 'failed';

  if (facts.holds.ended && !isFailed) {
    return 'stopped';
  }

  if (facts.holds.limit) {
    return 'limit';
  }

  return facts.holds.task || (isFailed && facts.isPauseUnanswered) ? 'paused' : null;
}
