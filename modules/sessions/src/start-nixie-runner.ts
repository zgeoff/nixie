import type { CompactionSettings } from '@heynixie/compaction';
import { removeSummaryKeys } from '@heynixie/compaction';
import { removeThreadLinks } from '@heynixie/connectors';
import { subscribeToRecordCommits, writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { ResolvedProfile } from '@heynixie/models';
import {
  buildModelGrant,
  deriveModelSecret,
  modelSessionCleanupCompletedCodec,
  modelSessionInvalidatedCodec,
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
import type { SessionGuard } from './make-session-guard';
import { makeSessionGuard } from './make-session-guard';
import type { SystemTaskOptions, SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { isGuestPurged, pickCleanedTaskIDs } from './plan-task-session-cleanup';
import { isImpReleasedAfterStep, planTaskStep } from './plan-task-step';
import { readTaskUsage } from './read-task-usage';
import { runConversationStep } from './run-conversation-step';
import { runGuestPurge } from './run-guest-purge';
import { sessionImageBudget } from './session-image-budget';
import type { TaskImp, TaskImpParts } from './task-imp-machine';
import { taskImpMachine } from './task-imp-machine';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRun,
  SessionCleanupCause,
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

  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;
}

type TaskImpActor = Actor<typeof taskImpMachine>;

interface TaskRunner {
  readonly options: NixieRunnerOptions;
  readonly session: SystemTaskSession;
  readonly profiles: Readonly<Record<string, ResolvedProfile>>;

  readonly grants: Map<string, Promise<GrantSpec>>;
  readonly imps: Map<string, TaskImpActor>;
  readonly guards: Map<string, SessionGuard>;
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
      guards: new Map(),
    };

    // The task role's secret goes in at start, so a deployment that lacks it fails here and not at
    // the first started task.
    await resolveModelGrant(runner, session.profile);

    session.defer(() => stopTaskImps(runner));

    const watch = startEndedTaskWatch(runner);

    session.defer(() => watch.stop());

    return {
      runStep: (input) => runStartedStep(runner, input),
      cleanupSessions: (cause) => runTaskSessionCleanup(runner, cause),
    };
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
  runner.guards.delete(taskID);
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

// The sweep makes an imp only to remove its sandboxes, so the imp reads its task's run when a step
// needs it. Each call reads it again, so a read that failed never sticks to the imp.
function buildTaskImpParts(runner: TaskRunner, taskID: string): TaskImpParts {
  const options = runner.options;

  return {
    startEndpoint: async () => {
      const run = await readStartedRun(runner, taskID);

      return options.tools.startRun({
        runID: taskID,
        thread: taskID,
        tools: run.options.tools,
        model: run.model,
      });
    },
    readSandbox: (id) => options.sandboxes.read(id),
    createSandbox: async () => {
      const run = await readStartedRun(runner, taskID);

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

interface StartedRun {
  readonly startedBy: string;
  readonly options: TaskRunOptions;
  readonly limits: TaskLimits;
  readonly profile: ResolvedProfile;
  readonly model: ToolRunModel;
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

// A forget's cleanup waits for the whole step, the imp's acquire and release included, so its purge
// never meets the imp part way through a change.
function runStartedStep(runner: TaskRunner, input: StepInput): Promise<StepResult> {
  return resolveTaskGuard(runner, input.taskID).withTurn((invalidated) =>
    runGuardedStep(runner, input, invalidated),
  );
}

function resolveTaskGuard(runner: TaskRunner, taskID: string): SessionGuard {
  const held = runner.guards.get(taskID);

  if (held !== undefined) {
    return held;
  }

  const guard = makeSessionGuard();

  runner.guards.set(taskID, guard);

  return guard;
}

async function runGuardedStep(
  runner: TaskRunner,
  input: StepInput,
  invalidated: AbortSignal,
): Promise<StepResult> {
  const context = runner.options.context;

  const run = await readStartedRun(runner, input.taskID);
  const used = await readTaskUsage(context, input.taskID, run.profile.profile.prices);

  const held = runner.imps.get(input.taskID);

  const plan = planTaskStep({
    used,
    limits: run.limits,
    isImpAwake: held?.getSnapshot().matches('awake') === true,
  });

  if (plan.kind === 'pause') {
    await writeTaskLimitPause(context, {
      lease: input.lease,
      stepKey: input.stepKey,
      startedBy: run.startedBy,
      used,
      limits: run.limits,
    });

    if (plan.isImpReleased && held !== undefined) {
      await releaseTaskImp(held);
    }

    // The step had work when its runner claimed it, so the task keeps that work for the raise.
    return {
      next: 'continue',
      records: [],
      acknowledged: [],
      sessionBoundary: input.sessionBoundary,
    };
  }

  return runTaskTurn(runner, input, { run, invalidated });
}

async function releaseTaskImp(imp: TaskImpActor): Promise<void> {
  const released = Promise.withResolvers<void>();

  imp.send({ type: 'release', reply: released });

  await released.promise;
}

interface TaskTurnParts {
  readonly run: StartedRun;
  readonly invalidated: AbortSignal;
}

async function runTaskTurn(
  runner: TaskRunner,
  input: StepInput,
  parts: TaskTurnParts,
): Promise<StepResult> {
  const imp = resolveTaskImp(runner, input.taskID);
  const acquired = Promise.withResolvers<TaskImp>();

  imp.send({ type: 'acquire', reply: acquired });

  const held = await acquired.promise;
  const result = await runConversationStep(buildTaskRun(runner, { ...parts, ...held }), input);

  if (isImpReleasedAfterStep(result)) {
    await releaseTaskImp(imp);
  }

  return result;
}

interface TaskRunParts {
  readonly run: StartedRun;
  readonly endpoint: RunEndpoint;
  readonly sandbox: Sandbox;
  readonly invalidated: AbortSignal;
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
    session: buildHeldSessionGuard(parts.invalidated),
  };
}

// The step already holds the task's own guard, so the turn takes the signal that guard gave it.
function buildHeldSessionGuard(invalidated: AbortSignal): SessionGuard {
  return {
    withTurn: (run) => run(invalidated),
    withInvalidation: () => {
      invariant(false, "a started task's cleanup goes through the task's own guard");
    },
  };
}

async function runTaskSessionCleanup(
  runner: TaskRunner,
  cause: SessionCleanupCause,
): Promise<void> {
  const context = runner.options.context;

  const open = await readStartedTaskIDs(context, { end: 'open' });

  const candidates = await Promise.all(
    open.map(async (taskID) => ({ taskID, setup: await readTaskSetup(context, taskID) })),
  );

  for (const taskID of pickCleanedTaskIDs(candidates)) {
    await resolveTaskGuard(runner, taskID).withInvalidation(() =>
      cleanTaskSession(runner, taskID, cause),
    );
  }
}

// The invalidation goes in even before the task's first session opens, because a step that ended
// before the forget can still commit that session after the cleanup returns.
async function cleanTaskSession(
  runner: TaskRunner,
  taskID: string,
  cause: SessionCleanupCause,
): Promise<void> {
  const context = runner.options.context;

  await writeRecords(context.log, [
    {
      kind: modelSessionInvalidatedCodec.kind,
      definitions: context.definitions(),
      thread: taskID,
      payload: modelSessionInvalidatedCodec.encode(cause),
    },
  ]);

  await removeSummaryKeys(context.log, taskID);
  await removeThreadLinks(context.log, taskID);

  const sandboxes = await runner.options.sandboxes.list(taskID);

  if (isGuestPurged(sandboxes.length)) {
    await runTaskGuestPurge(runner, taskID);
  }

  await writeRecords(context.log, [
    {
      kind: modelSessionCleanupCompletedCodec.kind,
      definitions: context.definitions(),
      thread: taskID,
      payload: modelSessionCleanupCompletedCodec.encode(cause),
    },
  ]);
}

async function runTaskGuestPurge(runner: TaskRunner, taskID: string): Promise<void> {
  const imp = resolveTaskImp(runner, taskID);
  const acquired = Promise.withResolvers<TaskImp>();

  imp.send({ type: 'acquire', reply: acquired });

  const held = await acquired.promise;

  try {
    await runGuestPurge({ sandbox: held.sandbox, command: runner.session.command });
  } finally {
    await releaseTaskImp(imp);
  }
}
