import { startActionRunners } from '@heynixie/actions';
import { toErrorFields } from '@heynixie/logger';
import type { SpendContext } from '@heynixie/spend';
import { readSpendStop } from '@heynixie/spend';
import type { RunStep } from '@heynixie/tasks';
import { startTaskClaimPools } from '@heynixie/tasks';
import { buildToolRegistry } from '@heynixie/tools';
import { makeAttemptCheck } from '../action/make-attempt-check';
import { makeConversationFailureMarker } from '../conversation/make-conversation-failure-marker';
import type { ServerParts } from '../types';
import { makeStepErrorLogger } from './make-step-error-logger';

export async function startRunners(parts: ServerParts, runStep: RunStep): Promise<void> {
  const onError = (error: unknown) => {
    parts.log('runner.failed', toErrorFields(error));
    parts.onFailure(error);
  };

  const spend = parts.apiContext.spend;
  const logStepError = makeStepErrorLogger(parts.log);
  const markConversationFailure = makeConversationFailureMarker(parts.state);

  const tasks = startTaskClaimPools(parts.context, {
    runStep: parts.tools.actions.trackSteps(runStep),
    started: {
      runStep: parts.tools.actions.trackSteps(runStep),
      size: parts.config.tasks.startedClaimLoops,
    },
    onStepErrored: (errored) => {
      logStepError(errored);
      markConversationFailure(errored);
    },
    onError,
    logger: parts.log,
    ...(spend === undefined ? {} : { probeSpendStop: () => probeSpendStopped(spend) }),
    size: parts.config.tasks.runners,
  });

  const registry = buildToolRegistry([
    ...parts.tools.definitions,
    parts.tools.actions.logConnector.tool,
  ]);

  const actions = startActionRunners(parts.context, {
    connectors: parts.tools.actions.connectors,
    checkAttempt: makeAttemptCheck({
      log: parts.apiContext.log,
      clock: parts.context.clock,
      definitions: parts.apiContext.definitions,
      decisions: parts.decisions,
      registry,
    }),
    onError,
    size: parts.config.actions.runners,
  });

  await parts.cleanup.defer(async () => {
    await Promise.all([tasks.stop(), actions.stop()]);
  });
}

async function probeSpendStopped(spend: SpendContext): Promise<boolean> {
  const stop = await readSpendStop(spend);

  return stop.state !== 'clear';
}
