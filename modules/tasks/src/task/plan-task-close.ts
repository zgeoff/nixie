import type { TaskState } from '../types';

export interface TaskCloseFacts {
  readonly isCaller: boolean;
  readonly isConversation: boolean;
  readonly isStarted: boolean;
  readonly state: TaskState;
}

export type TaskCloseRefusal =
  | { readonly reason: 'unknown_task' }
  | { readonly reason: 'own_task' }
  | { readonly reason: 'conversation' }
  | { readonly reason: 'not_started' }
  | { readonly reason: 'still_working'; readonly state: 'ready' | 'running' }
  | { readonly reason: 'stale_step' };

export type TaskClosePlan =
  | { readonly status: 'close' }
  | { readonly status: 'already_closed' }
  | { readonly status: 'refused'; readonly refusal: TaskCloseRefusal };

// A started task closes in any state but ready and running. The owner's close control keeps its own,
// wider rules.
export function planTaskClose(facts: TaskCloseFacts | null): TaskClosePlan {
  if (facts === null) {
    return { status: 'refused', refusal: { reason: 'unknown_task' } };
  }

  if (facts.isCaller) {
    return { status: 'refused', refusal: { reason: 'own_task' } };
  }

  if (facts.isConversation) {
    return { status: 'refused', refusal: { reason: 'conversation' } };
  }

  if (!facts.isStarted) {
    return { status: 'refused', refusal: { reason: 'not_started' } };
  }

  if (facts.state === 'closed') {
    return { status: 'already_closed' };
  }

  if (facts.state === 'ready' || facts.state === 'running') {
    return { status: 'refused', refusal: { reason: 'still_working', state: facts.state } };
  }

  return { status: 'close' };
}
