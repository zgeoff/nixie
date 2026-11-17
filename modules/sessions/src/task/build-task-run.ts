import type { Sandbox } from '@heynixie/sandbox';
import type { RunEndpoint } from '@heynixie/tools';
import { buildHeldSessionGuard } from '../held/build-held-session-guard';
import { buildDefaultStatus } from '../session/build-default-status';
import type { ConversationRun } from '../types';
import { buildRoutedModel } from '../utils/build-routed-model';
import { sessionImageBudget } from '../utils/session-image-budget';
import type { CallBudget } from './create-call-budget';
import type { StartedRun } from './read-started-run';
import type { SandboxRunnerOptions } from './sandbox-runner-options';

export interface TaskRunParts {
  readonly run: StartedRun;
  readonly budget: CallBudget;
  readonly endpoint: RunEndpoint;
  readonly sandbox: Sandbox;
  readonly invalidated: AbortSignal;
}

// No one watches a task turn, so a model that loops on tool calls stops at this many calls.
const taskModelCallLimit = 100;

export function buildTaskRun(options: SandboxRunnerOptions, parts: TaskRunParts): ConversationRun {
  const routed = buildRoutedModel({
    isRouted: options.gateway !== undefined,
    profile: parts.run.profile,
    turnProfile: parts.run.harness.toTurnProfile('kept'),
    sandboxName: parts.sandbox.id,
  });

  return {
    context: options.context,
    frame: {
      kind: 'task',
      startedBy: parts.run.startedBy,
      report: parts.run.options.report,
    },
    ...(parts.run.sinceSequence === null ? {} : { sinceSequence: parts.run.sinceSequence }),
    profile: routed.profile,
    harness: parts.run.harness,
    turnProfile: routed.turnProfile,
    sandbox: parts.sandbox,
    endpoint: parts.endpoint,
    model: parts.run.model,
    command: parts.run.command,
    modelCallLimit: taskModelCallLimit,
    onModelCall: parts.budget.onCall,
    budget: parts.budget,
    ...(options.turnInputs === undefined ? {} : { turnInputs: options.turnInputs }),
    getDefinitions: () =>
      parts.run.options.persona === 'default'
        ? options.getDefinitions()
        : { ...options.getDefinitions(), persona: '', personaHash: '' },
    status: buildDefaultStatus(),
    ...(parts.run.options.memory === 'read' ? { memory: options.memory } : {}),
    memorySettings: options.memorySettings,
    compaction: options.compaction,
    defaultZone: options.defaultZone,
    messaging: options.messaging,
    imageBudget: sessionImageBudget,
    session: buildHeldSessionGuard(parts.invalidated),
    clearFetchPauses: options.clearFetchPauses,
    log: options.log,
  };
}
