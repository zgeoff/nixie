import type { ActionAttempt } from '@heynixie/connections';
import type { ActionMarker } from './build-action-marker';
import { buildActionMarker } from './build-action-marker';

// The marker of an action: its key from the action's ID and its value from the time the queue
// recorded the action, so every attempt and every check of the action builds the same one. An
// attempt that carries no queue time, which only a test builds, takes the time given.
export function buildAttemptMarker(attempt: ActionAttempt, nowMs: number): ActionMarker {
  return buildActionMarker(attempt.actionID, Math.floor((attempt.queuedAt ?? nowMs) / 1000));
}
