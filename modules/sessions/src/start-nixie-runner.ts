import type { CompactionSettings } from '@heynixie/compaction';
import { subscribeToRecordCommits } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { ResolvedProfile } from '@heynixie/models';
import {
  buildModelGrant,
  deriveModelSecret,
  resolveModelCredentials,
  toTurnProfile,
} from '@heynixie/models';
import type { GrantSpec, Sandbox } from '@heynixie/sandbox';
import { readSandboxOwners } from '@heynixie/sandbox';
import type {
  RunStep,
  StepInput,
  StepResult,
  TaskLimits,
  TaskMessaging,
  TaskRunOptions,
  TaskSetup,
  TasksContext,
} from '@heynixie/tasks';
import {
  readStartedTaskIDs,
  readTaskSetup,
  startRunnerPool,
  startedTaskDefaultTools,
  writeTaskLimitPause,
} from '@heynixie/tasks';
import type { RunEndpoint, ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import { buildDefaultStatus } from './build-default-status';
import { createWorkerSandbox } from './create-worker-sandbox';
import { isAtTaskLimit } from './is-at-task-limit';
import { makeSessionGuard } from './make-session-guard';
import type { SystemTaskOptions, SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { readTaskUsage } from './read-task-usage';
import { runConversationStep } from './run-conversation-step';
import { sessionImageBudget } from './session-image-budget';
import type { TaskImp, TaskImpParts } from './task-imp-machine';
import { taskImpMachine } from './task-imp-machine';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRun,
  SessionDefinitions,
} from './types';

export interface NixieRunnerOptions extends SystemTaskOptions {
  readonly context: TasksContext;

  readonly tools: Pick<ToolEndpoint, 'startRun'>;

  readonly getDefinitions: () => SessionDefinitions;

  readonly memory: () => ConversationMemory;
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
  readonly profiles: Readonly<Record<string, ResolvedProfile>>;

  readonly grants: Map<string, Promise<GrantSpec>>;
  readonly imps: Map<string, TaskImpActor>;
}

export const startNixieRunner = makeSystemTaskRunner<NixieRunnerOptions, NixieRunner>({
  role: 'task',
  entry: 'main',
  start: async (options, session) => {
    const runner: TaskRunner = {
      options,
      session,
      profiles: resolveModelCredentials(options.models, options.secrets),
      grants: new Map(),
      imps: new Map(),
    };

    // The task role's secret goes in at start, so a deployment that lacks it fails here and not at
    // the first started task.
    await resolveModelGrant(runner, session.profile);

    session.defer(() => stopTaskImps(runner));

    const watch = startEndedTaskWatch(runner);

    session.defer(() => watch.stop());

    return { runStep: (input) => runStartedStep(runner, input) };
  },
});

function resolveModelGrant(runner: TaskRunner, profile: ResolvedProfile): Promise<GrantSpec> {
  const held = runner.grants.get(profile.profile.id);

  if (held !== undefined) {
    return held;
  }

  const granted = createModelGrant(runner, profile);

  runner.grants.set(profile.profile.id, granted);

  return granted;
}

// A failed add leaves no grant behind, so the next step that needs the profile tries again.
async function createModelGrant(runner: TaskRunner, profile: ResolvedProfile): Promise<GrantSpec> {
  const secret = deriveModelSecret(profile);

  try {
    await runner.options.sandboxes.addSecret(secret);
  } catch (error) {
    runner.grants.delete(profile.profile.id);
    throw error;
  }

  return buildModelGrant(secret);
}

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

interface StartedRun {
  readonly startedBy: string;
  readonly options: TaskRunOptions;
  readonly limits: TaskLimits;
  readonly profile: ResolvedProfile;
  readonly model: ToolRunModel;
}

// The sweep makes an imp only to remove its sandboxes, so the imp reads its task's run when a step
// first needs it.
function buildTaskImpParts(runner: TaskRunner, taskID: string): TaskImpParts {
  const options = runner.options;
  let started: Promise<StartedRun> | null = null;

  const readRun = (): Promise<StartedRun> => {
    started ??= readStartedRun(runner, taskID);

    return started;
  };

  return {
    startEndpoint: async () => {
      const run = await readRun();

      return options.tools.startRun({
        runID: taskID,
        thread: taskID,
        tools: run.options.tools,
        model: run.model,
      });
    },
    readSandbox: (id) => options.sandboxes.read(id),
    createSandbox: async () => {
      const run = await readRun();

      return createWorkerSandbox({
        sandboxes: options.sandboxes,
        image: options.image,
        owner: taskID,
        limits: runner.session.limits,
        modelGrant: await resolveModelGrant(runner, run.profile),
      });
    },
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

async function readStartedRun(runner: TaskRunner, taskID: string): Promise<StartedRun> {
  const setup = await readTaskSetup(runner.options.context, taskID);

  invariant(setup !== null, `the nixie runner runs started tasks only, not ${taskID}`);

  return buildStartedRun(runner, setup);
}

function buildStartedRun(runner: TaskRunner, setup: TaskSetup): StartedRun {
  const defaultLimits = runner.options.models.limits.taskRun.default;

  // A task that the user started by moving a message to it holds no options, so it runs with no
  // persona, no memory and the default tools.
  const options: TaskRunOptions = setup.options ?? {
    model: null,
    profile: null,
    persona: 'none',
    memory: 'none',
    tools: startedTaskDefaultTools,
    report: 'wake',
    limits: defaultLimits,
  };

  const profile =
    options.profile === null ? runner.session.profile : runner.profiles[options.profile];

  invariant(profile, `the task's profile ${options.profile ?? ''} is not defined`);

  return {
    startedBy: setup.startedBy,
    options,
    limits: setup.limits ?? options.limits,
    profile,
    model: { model: profile.profile.model, profile: profile.profile.id },
  };
}

async function runStartedStep(runner: TaskRunner, input: StepInput): Promise<StepResult> {
  const context = runner.options.context;

  const run = await readStartedRun(runner, input.taskID);
  const used = await readTaskUsage(context, input.taskID, run.profile.profile.prices);

  if (isAtTaskLimit(used, run.limits)) {
    await writeTaskLimitPause(context, {
      lease: input.lease,
      stepKey: input.stepKey,
      startedBy: run.startedBy,
      used,
      limits: run.limits,
    });

    // The step had work when its runner claimed it, so the task keeps that work for the raise.
    return {
      next: 'continue',
      records: [],
      acknowledged: [],
      sessionBoundary: input.sessionBoundary,
    };
  }

  const imp = resolveTaskImp(runner, input.taskID);
  const acquired = Promise.withResolvers<TaskImp>();

  imp.send({ type: 'acquire', reply: acquired });

  const held = await acquired.promise;
  const result = await runConversationStep(buildTaskRun(runner, { run, ...held }), input);

  if (result.next === 'wait') {
    const released = Promise.withResolvers<void>();

    imp.send({ type: 'release', reply: released });

    await released.promise;
  }

  return result;
}

interface TaskRunParts {
  readonly run: StartedRun;
  readonly endpoint: RunEndpoint;
  readonly sandbox: Sandbox;
}

function buildTaskRun(runner: TaskRunner, parts: TaskRunParts): ConversationRun {
  const options = runner.options;
  const run = parts.run;

  return {
    context: options.context,
    frame: { kind: 'task', startedBy: run.startedBy, report: run.options.report },
    profile: run.profile,
    turnProfile: toTurnProfile(run.profile.profile),
    sandbox: parts.sandbox,
    endpoint: parts.endpoint,
    model: run.model,
    command: runner.session.command,
    getDefinitions: () =>
      run.options.persona === 'default'
        ? options.getDefinitions()
        : { ...options.getDefinitions(), persona: '', personaHash: '' },
    status: buildDefaultStatus(),
    ...(run.options.memory === 'read' ? { memory: options.memory } : {}),
    memorySettings: options.memorySettings,
    compaction: options.compaction,
    defaultZone: options.defaultZone,
    messaging: options.messaging,
    imageBudget: sessionImageBudget,
    session: makeSessionGuard(),
  };
}
