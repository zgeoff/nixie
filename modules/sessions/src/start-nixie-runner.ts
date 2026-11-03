import type { CompactionSettings } from '@heynixie/compaction';
import { subscribeToRecordCommits } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { buildModelGrant, deriveModelSecret, toTurnProfile } from '@heynixie/models';
import type { GrantSpec, Sandbox } from '@heynixie/sandbox';
import { readSandboxOwners } from '@heynixie/sandbox';
import type { RunStep, StepInput, StepResult, TaskMessaging, TasksContext } from '@heynixie/tasks';
import { readStartedTaskIDs, readTaskStarter, startRunnerPool } from '@heynixie/tasks';
import type { RunEndpoint, ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildDefaultStatus } from './build-default-status';
import { createWorkerSandbox } from './create-worker-sandbox';
import { makeSessionGuard } from './make-session-guard';
import type { SystemTaskOptions, SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { runConversationStep } from './run-conversation-step';
import { sessionImageBudget } from './session-image-budget';
import type { ConversationMemorySettings, ConversationRun, SessionDefinitions } from './types';

export interface NixieRunnerOptions extends SystemTaskOptions {
  readonly context: TasksContext;

  readonly tools: Pick<ToolEndpoint, 'startRun'>;
  readonly toolNames: readonly string[];

  readonly getDefinitions: () => SessionDefinitions;

  readonly memorySettings: ConversationMemorySettings;
  readonly compaction: CompactionSettings;
  readonly defaultZone: string;
  readonly messaging: TaskMessaging;

  readonly log: Logger;
}

export interface NixieRunner {
  readonly runStep: RunStep;
}

interface TaskSandbox {
  readonly sandbox: Sandbox;
  readonly isAsleep: boolean;
}

interface TaskRunner {
  readonly options: NixieRunnerOptions;
  readonly session: SystemTaskSession;
  readonly grant: GrantSpec;
  readonly model: ToolRunModel;

  readonly endpoints: Map<string, Promise<RunEndpoint>>;
  readonly sandboxes: Map<string, TaskSandbox>;
}

export const startNixieRunner = makeSystemTaskRunner<NixieRunnerOptions, NixieRunner>({
  role: 'task',
  entry: 'main',
  start: async (options, session) => {
    const secret = deriveModelSecret(session.profile);

    await options.sandboxes.addSecret(secret);

    const runner: TaskRunner = {
      options,
      session,
      grant: buildModelGrant(secret),
      model: { model: session.profile.profile.model, profile: session.profile.profile.id },
      endpoints: new Map(),
      sandboxes: new Map(),
    };

    session.defer(() => removeEndpoints(runner));

    const watch = startEndedTaskWatch(runner);

    session.defer(() => watch.stop());

    return { runStep: (input) => runStartedStep(runner, input) };
  },
});

async function removeEndpoints(runner: TaskRunner): Promise<void> {
  await Promise.all([...runner.endpoints.keys()].map((taskID) => removeEndpoint(runner, taskID)));
}

async function removeEndpoint(runner: TaskRunner, taskID: string): Promise<void> {
  const started = runner.endpoints.get(taskID);

  runner.endpoints.delete(taskID);

  const endpoint = await started;

  await endpoint?.stop();
}

interface EndedTaskWatch {
  readonly stop: () => Promise<void>;
}

// A step returns before its commit, and a close of an idle task runs no step, so the imp of a
// task that ended goes from a watch on the commits instead.
function startEndedTaskWatch(runner: TaskRunner): EndedTaskWatch {
  const context = runner.options.context;

  const sweep = startRunnerPool<never>(context.clock, {
    size: 1,
    pollMs: 60_000,

    // The pool stops for good on a throw, so a failed sweep logs and waits for the next one.
    claim: async () => {
      try {
        await removeEndedTasks(runner);
      } catch (error) {
        runner.options.log('nixie_runner.sweep_failed', toErrorFields(error), 'error');
      }

      return null;
    },
    run: async () => {},
    onError: (error) => {
      runner.options.log('nixie_runner.watch_stopped', toErrorFields(error), 'error');
    },
  });

  const unsubscribe = subscribeToRecordCommits(context.log.writer, sweep.wake);

  return {
    stop: async () => {
      unsubscribe();

      await sweep.stop();
    },
  };
}

async function removeEndedTasks(runner: TaskRunner): Promise<void> {
  const options = runner.options;

  const owners = await readSandboxOwners(options.context.log, options.sandboxes.id);

  const ended = await readStartedTaskIDs(options.context, {
    end: 'ended',
    among: [...new Set([...owners, ...runner.endpoints.keys()])],
  });

  // One task whose removal fails stays ended, so it is in the next sweep, and the rest go now.
  for (const taskID of ended) {
    try {
      await removeEndedTask(runner, taskID);
    } catch (error) {
      options.log('nixie_runner.task_remove_failed', { taskID, ...toErrorFields(error) }, 'error');
    }
  }
}

async function removeEndedTask(runner: TaskRunner, taskID: string): Promise<void> {
  const options = runner.options;

  const sandboxes = await options.sandboxes.list(taskID);

  await Promise.all(sandboxes.map((sandbox) => sandbox.destroy()));

  await removeEndpoint(runner, taskID);

  runner.sandboxes.delete(taskID);
  options.log('nixie_runner.task_removed', { taskID, sandboxes: sandboxes.length });
}

async function runStartedStep(runner: TaskRunner, input: StepInput): Promise<StepResult> {
  const startedBy = await readTaskStarter(runner.options.context, input.taskID);

  invariant(startedBy !== null, `the nixie runner runs started tasks only, not ${input.taskID}`);

  const endpoint = await resolveEndpoint(runner, input.taskID);
  const sandbox = await resolveAwakeSandbox(runner, input.taskID);

  const result = await runConversationStep(
    buildTaskRun(runner, { startedBy, endpoint, sandbox }),
    input,
  );

  if (result.next === 'wait') {
    await sleepSandbox(runner, input.taskID, sandbox);
  }

  return result;
}

// A task runs one step at a time, so a start that failed leaves the cache before the next step.
async function resolveEndpoint(runner: TaskRunner, taskID: string): Promise<RunEndpoint> {
  const started =
    runner.endpoints.get(taskID) ??
    runner.options.tools.startRun({
      runID: taskID,
      thread: taskID,
      tools: runner.options.toolNames,
      model: runner.model,
    });

  runner.endpoints.set(taskID, started);

  try {
    return await started;
  } catch (error) {
    runner.endpoints.delete(taskID);
    throw error;
  }
}

// A sandbox that the host lost is gone from the adapter, so the step gets a new one, and the
// guest's missing session sends the step down the rebuild path.
async function resolveAwakeSandbox(runner: TaskRunner, taskID: string): Promise<Sandbox> {
  const cached = runner.sandboxes.get(taskID);

  const current =
    cached === undefined ? null : await runner.options.sandboxes.read(cached.sandbox.id);

  const held =
    cached !== undefined && current !== null ? cached : await createTaskSandbox(runner, taskID);

  if (held.isAsleep && held.sandbox.suspension.kind === 'memory') {
    await held.sandbox.suspension.wake();
  }

  runner.sandboxes.set(taskID, { sandbox: held.sandbox, isAsleep: false });

  return held.sandbox;
}

async function createTaskSandbox(runner: TaskRunner, taskID: string): Promise<TaskSandbox> {
  const created = await createWorkerSandbox({
    sandboxes: runner.options.sandboxes,
    image: runner.options.image,
    owner: taskID,
    limits: runner.session.limits,
    modelGrant: runner.grant,
  });

  // A kept sandbox may sleep from an earlier process, and waking an awake one costs nothing.
  return { sandbox: created.sandbox, isAsleep: created.isKept };
}

interface TaskRunParts {
  readonly startedBy: string;
  readonly endpoint: RunEndpoint;
  readonly sandbox: Sandbox;
}

function buildTaskRun(runner: TaskRunner, parts: TaskRunParts): ConversationRun {
  const options = runner.options;
  const profile = runner.session.profile;

  return {
    context: options.context,
    frame: { kind: 'task', startedBy: parts.startedBy },
    profile,
    turnProfile: toTurnProfile(profile.profile),
    sandbox: parts.sandbox,
    endpoint: parts.endpoint,
    model: runner.model,
    command: runner.session.command,
    getDefinitions: () => ({ ...options.getDefinitions(), persona: '', personaHash: '' }),
    status: buildDefaultStatus(),
    memorySettings: options.memorySettings,
    compaction: options.compaction,
    defaultZone: options.defaultZone,
    messaging: options.messaging,
    imageBudget: sessionImageBudget,
    session: makeSessionGuard(),
  };
}

async function sleepSandbox(runner: TaskRunner, taskID: string, sandbox: Sandbox): Promise<void> {
  if (sandbox.suspension.kind === 'none') {
    return;
  }

  await sandbox.suspension.sleep();

  runner.sandboxes.set(taskID, { sandbox, isAsleep: true });
}
