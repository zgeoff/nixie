import { startActionRunners } from '@heynixie/actions';
import { toErrorFields } from '@heynixie/ops';
import type { RunStep } from '@heynixie/tasks';
import { startTaskRunners } from '@heynixie/tasks';
import { makeConversationFailureMarker } from './make-conversation-failure-marker';
import { makeStepErrorLogger } from './make-step-error-logger';
import type { ServerParts } from './types';

// Starts the task and action runners. They stop together, so the steps and attempts in flight
// share one grace, 30 s by default, to commit. Each step error logs a line with no message, and the
// conversation's errors at the limit mark the conversation imp unready.
export async function startRunners(parts: ServerParts, runStep: RunStep): Promise<void> {
  const onError = (error: unknown) => {
    parts.log('runner.failed', toErrorFields(error));
    parts.onFailure(error);
  };
  const logStepError = makeStepErrorLogger(parts.log);
  const markConversationFailure = makeConversationFailureMarker(parts.state);
  const tasks = startTaskRunners(parts.context, {
    runStep,
    onStepErrored: (errored) => {
      logStepError(errored);
      markConversationFailure(errored);
    },
    onError,
    size: parts.config.tasks.runners,
  });
  const actions = startActionRunners(parts.context, {
    connectors: new Map(),
    onError,
    size: parts.config.actions.runners,
  });

  await parts.cleanup.defer(async () => {
    await Promise.all([tasks.stop(), actions.stop()]);
  });
}
