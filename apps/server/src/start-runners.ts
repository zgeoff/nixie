import { startActionRunners } from '@heynixie/actions';
import { toErrorFields } from '@heynixie/logger';
import type { RunStep } from '@heynixie/tasks';
import { startTaskRunners } from '@heynixie/tasks';
import { makeConversationFailureMarker } from './make-conversation-failure-marker';
import { makeStepErrorLogger } from './make-step-error-logger';
import { startQueueCheckTask } from './start-queue-check-task';
import type { ServerParts } from './types';

export async function startRunners(parts: ServerParts, runStep: RunStep): Promise<void> {
  const onError = (error: unknown) => {
    parts.log('runner.failed', toErrorFields(error));
    parts.onFailure(error);
  };

  const steps = await startQueueCheckTask(parts, runStep);

  const logStepError = makeStepErrorLogger(parts.log);
  const markConversationFailure = makeConversationFailureMarker(parts.state);

  const tasks = startTaskRunners(parts.context, {
    runStep: parts.tools.actions.trackSteps(steps),
    onStepErrored: (errored) => {
      logStepError(errored);
      markConversationFailure(errored);
    },
    onError,
    size: parts.config.tasks.runners,
  });

  const actions = startActionRunners(parts.context, {
    connectors: parts.tools.actions.connectors,
    onError,
    size: parts.config.actions.runners,
  });

  await parts.cleanup.defer(async () => {
    await Promise.all([tasks.stop(), actions.stop()]);
  });
}
