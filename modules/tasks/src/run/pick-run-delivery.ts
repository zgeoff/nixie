import { isFinishedState } from '@heynixie/task-control';
import type { TaskReport, TaskState } from '../types';
import type { RunEndCause } from './run-end-cause';
import type { RunDelivery } from './types';

export interface RunDeliveryFacts {
  readonly cause: RunEndCause;
  readonly mode: TaskReport;

  // the state of the report target, or null when the task run has no target or it is gone
  readonly targetState: TaskState | null;

  // the hop of the step that the end belongs to, and the hop limit
  readonly hop: number;
  readonly hopLimit: number;

  // whether the report target made the close that ends the task run
  readonly isClosedByTarget: boolean;

  // whether a definition's version opened the task run
  readonly isDefinitionRun: boolean;
}

export interface RunDeliveryPlan {
  readonly delivery: RunDelivery;
  readonly isMessageWritten: boolean;
}

// The first row of the delivery table that applies. A message to a task that is done, failed or
// closed would throw, so a report to one is kept. A failed task run of a definition wakes its target
// under next_turn too, so the conversation hears of the failure when it happens.
export function pickRunDelivery(facts: RunDeliveryFacts): RunDeliveryPlan {
  if (
    facts.cause === 'no_work' ||
    facts.mode === 'none' ||
    facts.isClosedByTarget ||
    facts.targetState === null ||
    isFinishedState(facts.targetState)
  ) {
    return { delivery: 'kept', isMessageWritten: false };
  }

  const isFailedDefinitionRun = facts.cause === 'failed' && facts.isDefinitionRun;

  if ((facts.mode === 'next_turn' && !isFailedDefinitionRun) || facts.hop + 1 > facts.hopLimit) {
    return { delivery: 'next_turn', isMessageWritten: true };
  }

  return { delivery: 'wake', isMessageWritten: true };
}
