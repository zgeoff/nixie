import type { ActionMarker } from './build-action-marker';
import { buildActionMarker } from './build-action-marker';
import { readQueuedSeconds } from './read-queued-seconds';
import type { GoogleDeps } from './types';

// The marker of an action: its key from the action's ID and its value from the time the queue
// recorded the action, so every attempt and every check of the action builds the same one. An
// action the queue does not hold, which only a test reaches, takes the clock's time.
export async function readActionMarker(
  deps: Pick<GoogleDeps, 'log' | 'clock'>,
  actionID: string,
): Promise<ActionMarker> {
  const queuedSeconds = await readQueuedSeconds(deps.log, actionID);

  return buildActionMarker(actionID, queuedSeconds ?? Math.floor(deps.clock.now() / 1000));
}
