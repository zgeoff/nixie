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
import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import { buildDefaultStatus } from './build-default-status';
import { createWorkerSandbox } from './create-worker-sandbox';
import { makeSessionGuard } from './make-session-guard';
import type { SystemTaskOptions, SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { runConversationStep } from './run-conversation-step';
import { sessionImageBudget } from './session-image-budget';
import type { TaskImp, TaskImpParts } from './task-imp-machine';
import { taskImpMachine } from './task-imp-machine';
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

type TaskImpActor = Actor<typeof taskImpMachine>;

interface TaskRunner {
  readonly options: NixieRunnerOptions;
  readonly session: SystemTaskSession;
  readonly grant: GrantSpec;
  readonly model: ToolRunModel;

  readonly imps: Map<string, TaskImpActor>;
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
      imps: new Map(),
    };

    session.defer(() => stopTaskImps(runner));

    const watch = startEndedTaskWatch(runner);

    session.defer(() => watch.stop());

    return { runStep: (input) => runStartedStep(runner, input) };
  },
});

async function stopTaskImps(runner: TaskRunner): Promise<void> {
  const imps = [...runner.imps.values()];

  runner.imps.clear();

  await Promise.all(
    imps.map(async (imp) => {
      imp.stop();

      await imp.getSnapshot().context.endpoint?.stop();
    }),
  );
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
    among: [...new Set([...owners, ...runner.imps.keys()])],
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
  const imp = resolveTaskImp(runner, taskID);
  const removed = Promise.withResolvers<number>();

  imp.send({ type: 'remove', reply: removed });

  const sandboxes = await removed.promise;

  runner.imps.delete(taskID);
  imp.stop();
  runner.options.log('nixie_runner.task_removed', { taskID, sandboxes });
}

function resolveTaskImp(runner: TaskRunner, taskID: string): TaskImpActor {
  const held = runner.imps.get(taskID);

  if (held !== undefined) {
    return held;
  }

  const imp = createActor(taskImpMachine, { input: buildTaskImpParts(runner, taskID) });

  imp.start();
  runner.imps.set(taskID, imp);

  return imp;
}

function buildTaskImpParts(runner: TaskRunner, taskID: string): TaskImpParts {
  const options = runner.options;

  return {
    startEndpoint: () =>
      options.tools.startRun({
        runID: taskID,
        thread: taskID,
        tools: options.toolNames,
        model: runner.model,
      }),
    readSandbox: (id) => options.sandboxes.read(id),
    createSandbox: () =>
      createWorkerSandbox({
        sandboxes: options.sandboxes,
        image: options.image,
        owner: taskID,
        limits: runner.session.limits,
        modelGrant: runner.grant,
      }),
    removeSandboxes: async () => {
      const sandboxes = await options.sandboxes.list(taskID);

      await Promise.all(sandboxes.map((sandbox) => sandbox.destroy()));

      return sandboxes.length;
    },
    onSleepFailed: (error) => {
      options.log('nixie_runner.sleep_failed', { taskID, ...toErrorFields(error) }, 'error');
    },
  };
}

async function runStartedStep(runner: TaskRunner, input: StepInput): Promise<StepResult> {
  const startedBy = await readTaskStarter(runner.options.context, input.taskID);

  invariant(startedBy !== null, `the nixie runner runs started tasks only, not ${input.taskID}`);

  const imp = resolveTaskImp(runner, input.taskID);
  const acquired = Promise.withResolvers<TaskImp>();

  imp.send({ type: 'acquire', reply: acquired });

  const held = await acquired.promise;
  const result = await runConversationStep(buildTaskRun(runner, { startedBy, ...held }), input);

  if (result.next === 'wait') {
    const released = Promise.withResolvers<void>();

    imp.send({ type: 'release', reply: released });

    await released.promise;
  }

  return result;
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
