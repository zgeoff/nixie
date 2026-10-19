import type { ActionAttemptOptions } from '@heynixie/actions';
import type { TasksContext } from '@heynixie/tasks';
import { setFaultPointHandler } from '@heynixie/tasks';
import { runTestAttempt } from './run-test-attempt';

// Runs the next attempt as nixie dies once its attempt record commits, before the connector runs,
// and throws when the attempt outlives its attempt record.
export async function runCrashedTestAttempt(
  context: TasksContext,
  connectors: ActionAttemptOptions['connectors'],
): Promise<void> {
  setFaultPointHandler((id) => {
    if (id === 'attempt.record.after') {
      throw new Error('nixie died');
    }
  });

  try {
    await runTestAttempt(context, connectors);
  } catch (error) {
    if (error instanceof Error && error.message === 'nixie died') {
      return;
    }

    throw error;
  } finally {
    setFaultPointHandler(null);
  }

  throw new Error('the attempt outlived its attempt record');
}
