import type { TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createAllowedAction } from '../create-allowed-action';
import type { ActionRow } from '../types';
import type { AllowedCallSeed } from './build-mock-allowed-call';
import { buildMockAllowedCall } from './build-mock-allowed-call';
import { readTestAction } from './read-test-action';

export async function seedAction(
  context: TasksContext,
  input: AllowedCallSeed,
): Promise<ActionRow> {
  const queued = await createAllowedAction(context, buildMockAllowedCall(input));

  invariant(queued.status === 'pending' && !queued.isRepeat);

  return readTestAction(context.log.writer, queued.actionID);
}
