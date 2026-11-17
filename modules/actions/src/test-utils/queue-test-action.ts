import type { TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createAllowedAction } from '../action/create-allowed-action';
import type { QueuedAction } from '../action/create-allowed-action';
import type { AllowedCall } from '../types';

// Queues a call that no lift charges, so the owner is never asked in its place.
export async function queueTestAction(
  context: TasksContext,
  call: AllowedCall,
): Promise<QueuedAction> {
  const queued = await createAllowedAction(context, call);

  invariant(!('shortID' in queued), 'a call without a lift queues an action');

  return queued;
}
