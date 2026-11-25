import { startActionRunners } from '@heynixie/actions';
import { codingActionDeclarations } from '@heynixie/coding';
import { toErrorFields } from '@heynixie/logger';
import type { Mcp } from '@heynixie/mcp';
import type { RunStep } from '@heynixie/tasks';
import { startTaskClaimPools } from '@heynixie/tasks';
import { buildToolRegistry } from '@heynixie/tools';
import { makeAttemptCheck } from '../action/make-attempt-check';
import { makeConversationFailureMarker } from '../conversation/make-conversation-failure-marker';
import type { ServerParts } from '../types';
import { makeLazyToolSource } from './make-lazy-tool-source';
import { makeStepErrorLogger } from './make-step-error-logger';

export async function startRunners(
  parts: ServerParts,
  runStep: RunStep,
  readMcp: () => Mcp | null,
): Promise<void> {
  const onError = (error: unknown) => {
    parts.log('runner.failed', toErrorFields(error));
    parts.onFailure(error);
  };

  const logStepError = makeStepErrorLogger(parts.log);
  const markConversationFailure = makeConversationFailureMarker(parts.state);

  const tasks = startTaskClaimPools(parts.context, {
    runStep: parts.tools.actions.trackSteps(runStep),
    started: {
      runStep: parts.tools.actions.trackSteps(runStep),
      size: parts.config.tasks.startedClaimLoops,
    },
    call: {
      runStep: parts.tools.actions.trackSteps(runStep),
      size: parts.config.tasks.callClaimLoops,
    },
    onStepErrored: (errored) => {
      logStepError(errored);
      markConversationFailure(errored);
    },
    onError,
    logger: parts.log,
    size: parts.config.tasks.runners,
  });

  const registry = buildToolRegistry(
    [...parts.tools.definitions, parts.tools.actions.logConnector.tool],
    [makeLazyToolSource(() => readMcp()?.tools ?? null)],
  );

  const readConnector = (tool: string) =>
    parts.tools.actions.connectors.get(tool) ?? readMcp()?.findConnector(tool);

  const actions = startActionRunners(parts.context, {
    connectors: { get: readConnector },
    ...pickHeld(parts.tools.actions.readHeldToolPrefixes),
    ...(parts.tools.actions.admitTool === undefined
      ? {}
      : { admitTool: parts.tools.actions.admitTool }),
    checkAttempt: makeAttemptCheck({
      log: parts.apiContext.log,
      clock: parts.context.clock,
      definitions: parts.apiContext.definitions,
      decisions: parts.decisions,
      registry,
      findRunnerDeclaration: (tool) => codingActionDeclarations.get(tool) ?? null,
    }),
    onError,
    size: parts.config.actions.runners,
  });

  await parts.cleanup.defer(async () => {
    await Promise.all([tasks.stop(), actions.stop()]);
  });
}

function pickHeld(readHeldToolPrefixes: (() => readonly string[]) | undefined): {
  readonly readHeldToolPrefixes?: () => readonly string[];
} {
  return readHeldToolPrefixes === undefined ? {} : { readHeldToolPrefixes };
}
