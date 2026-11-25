import type { ActionRow } from '../types';

export interface GateWork {
  readonly isStarted: boolean;
}

// A runner's end hook queues its actions under a step key that starts with `ended:`, as the task's
// last act. The gate counts such an action as started, so the task's pause and limit never bar it,
// while nixie's pause and the spending stop still do.
export function buildGateWork(action: Pick<ActionRow, 'attempt_count' | 'step_key'>): GateWork {
  return { isStarted: action.attempt_count > 0 || action.step_key.startsWith('ended:') };
}
