import { removeSummaryKeys } from '@heynixie/compaction';
import { removeWebFetchThread } from '@heynixie/connectors';
import { subscribeToRecordCommits, writeRecords } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { ResolvedProfile } from '@heynixie/models';
import {
  bindHarness,
  grantModelSecret,
  modelSessionCleanupCompletedCodec,
  modelSessionInvalidatedCodec,
  resolveModelCredentials,
} from '@heynixie/models';
import type { GrantSpec } from '@heynixie/sandbox';
import { readSandboxOwners } from '@heynixie/sandbox';
import { SandboxCountsUnreachableError } from '@heynixie/spend';
import type { RunStep, StepInput, StepResult, TaskLimits, TaskRun } from '@heynixie/tasks';
import {
  conversationTaskID,
  probePauseRequested,
  readStartedTaskIDs,
  startClaimPool,
} from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import type { TaskImp, TaskImpParts } from '../sandbox/task-imp-machine';
import { taskImpMachine } from '../sandbox/task-imp-machine';
import { runConversationStep } from '../step/run-conversation-step';
import { voidLostReplies } from '../step/void-lost-replies';
import type { SessionCleanupCause } from '../types';
import { createWorkerSandbox } from '../utils/create-worker-sandbox';
import type { SessionGuard } from '../utils/make-session-guard';
import { makeSessionGuard } from '../utils/make-session-guard';
import { runGuestPurge } from '../utils/run-guest-purge';
import { waitForStepEnd } from '../utils/wait-for-step-end';
import { buildLimitResult } from './build-limit-result';
import { buildReachedLimit } from './build-reached-limit';
import { buildTaskRun } from './build-task-run';
import { collectEndpointTools } from './collect-endpoint-tools';
import { getHarnessImage } from './get-harness-image';
import { holdTaskStep } from './hold-task-step';
import type { SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { collectCompactionDollars } from './meter/collect-compaction-dollars';
import { createStepMeter } from './meter/create-step-meter';
import { isGuestPurged } from './pick-cleaned-task-ids';
import { planTaskStep } from './plan-task-step';
import { planTaskTurnEnd } from './plan-task-turn-end';
import { readCleanedTaskIDs } from './read-cleaned-task-ids';
import { readRunUsage } from './read-run-usage';
import type { StartedRun } from './read-started-run';
import { readStartedRun } from './read-started-run';
import { releaseTaskImp } from './release-task-imp';
import { removeTaskSandboxes } from './remove-task-sandboxes';
import type { SandboxRunnerOptions } from './sandbox-runner-options';

export interface SandboxRunner {
  readonly runStep: RunStep;

  // the step of a call's thread, which the call runner binds
  readonly runCallStep: RunStep;

  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;

  readonly stopCleanups: () => void;
}

type TaskImpActor = Actor<typeof taskImpMachine>;

interface TaskRunner {
  readonly options: SandboxRunnerOptions;
  readonly session: SystemTaskSession;
  readonly profiles: Readonly<Record<string, ResolvedProfile>>;

  readonly grants: Map<string, Promise<GrantSpec>>;
  readonly imps: Map<string, TaskImpActor>;

  // the version hash that each running endpoint started with, null for a task that has none
  readonly endpointHashes: Map<string, string | null>;
  readonly guards: Map<string, SessionGuard>;

  readonly shutdown: AbortController;
}

export const startSandboxRunner = makeSystemTaskRunner<SandboxRunnerOptions, SandboxRunner>({
  role: 'task',
  entry: 'turn',
  start: async (options, session) => {
    const runner: TaskRunner = {
      options,
      session,
      profiles: resolveModelCredentials(options.models, options.credentials.resolveCredential),
      grants: new Map(),
      imps: new Map(),
      endpointHashes: new Map(),
      guards: new Map(),
      shutdown: new AbortController(),
    };

    // The task role's secret goes in at start, so a deployment that lacks it fails here and not at
    // the first started task.
    await resolveModelGrant(runner, session.profile);

    session.defer(() => {
      runner.shutdown.abort(new Error('nixie is stopping'));

      return stopTaskImps(runner);
    });

    const watch = startEndedTaskWatch(runner);

    session.defer(() => watch.stop());

    return {
      runStep: (input) => runStartedStep(runner, input),
      runCallStep: (input) => runCallTask(runner, input),
      cleanupSessions: (cause) => runTaskSessionCleanup(runner, cause),
      stopCleanups: () => {
        runner.shutdown.abort(new Error('nixie is stopping'));
      },
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
  const harness = bindHarness(profile.profile);

  try {
    const secret = await grantModelSecret(profile, harness, {
      store: runner.options.credentials.store,
      sandboxes: runner.options.sandboxes,
    });

    return harness.buildGrant(secret);
  } catch (error) {
    runner.grants.delete(profile.profile.id);
    throw error;
  }
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

  const sweep = startClaimPool<never>(context.clock, {
    size: 1,
    pollMs: 60_000,

    // The pool stops for good on a throw, so a failed sweep logs and waits for the next one.
    claim: async () => {
      try {
        await removeEndedTasks(runner);
      } catch (error) {
        runner.options.log('sandbox_runner.sweep_failed', toErrorFields(error), 'error');
      }

      return null;
    },
    run: async () => {},
    onError: (error) => {
      runner.options.log('sandbox_runner.watch_stopped', toErrorFields(error), 'error');
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

  const candidates = [...new Set([...owners, ...runner.imps.keys()])];

  const ended = await readStartedTaskIDs(options.context, {
    end: 'ended',
    among: candidates,
  });

  // One task whose removal fails stays ended, so it is in the next sweep, and the rest go now.
  for (const taskID of ended) {
    try {
      await removeEndedTask(runner, taskID);
    } catch (error) {
      options.log('sandbox_runner.remove_failed', { taskID, ...toErrorFields(error) }, 'error');
    }
  }
}

async function removeEndedTask(runner: TaskRunner, taskID: string): Promise<void> {
  const imp = resolveTaskImp(runner, taskID);
  const removed = Promise.withResolvers<number>();

  imp.send({ type: 'remove', reply: removed });

  const sandboxes = await removed.promise;

  runner.imps.delete(taskID);
  runner.endpointHashes.delete(taskID);
  runner.guards.delete(taskID);
  imp.stop();
  runner.options.log('sandbox_runner.task_removed', { taskID, sandboxes });
}

function resolveTaskImp(runner: TaskRunner, taskID: string): TaskImpActor {
  const held = runner.imps.get(taskID);

  if (held !== undefined) {
    return held;
  }

  const imp = createActor(taskImpMachine, {
    input: buildTaskImpParts(runner, taskID),
  });

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

      runner.endpointHashes.set(taskID, run.definitionHash);

      if (run.skills.length > 0) {
        await options.skills?.join({ thread: taskID, list: run.skills });
      }

      return options.tools.startRun({
        runID: taskID,
        thread: taskID,
        logThread: run.options.log === 'conversation' ? conversationTaskID : taskID,
        tools: collectEndpointTools(run),
        model: run.model,
        skills: run.skills,
        ...(run.hasSelfNoteGrant
          ? { hasSelfNoteGrant: true, selfNoteOnlyTools: run.selfNoteOnlyTools }
          : {}),
        toolUseMetaKey: run.harness.toolUseMetaKey,
      });
    },
    readSandbox: (id) => options.sandboxes.read(id),
    createSandbox: async () => {
      const run = await readStartedRun(runner, taskID);
      const modelGrant = await resolveModelGrant(runner, run.profile);

      try {
        return await createWorkerSandbox({
          sandboxes: options.sandboxes,
          image: getHarnessImage(options.images, run.harness.imageKey),
          owner: taskID,
          limits: runner.session.limits,
          modelGrant,
          log: options.log,
        });
      } catch (error) {
        // A failed create lets the broker drop the grant's secret, so the next step grants again.
        runner.grants.delete(run.profile.profile.id);
        throw error;
      }
    },
    removeSandboxes: () => removeTaskSandboxes(options, taskID),
    onSleepFailed: (error) => {
      options.log('sandbox_runner.sleep_failed', { taskID, ...toErrorFields(error) }, 'error');
    },
  };
}

// A forget's cleanup waits for the whole step, the imp's acquire and release included, so its purge
// never meets the imp part way through a change.
function runStartedStep(runner: TaskRunner, input: StepInput): Promise<StepResult> {
  return resolveTaskGuard(runner, input.taskID).withTurn(
    (invalidated) => runGuardedStep(runner, input, invalidated),
    { stepKey: input.stepKey, generation: input.lease.generation },
  );
}

function resolveTaskGuard(runner: TaskRunner, taskID: string): SessionGuard {
  const held = runner.guards.get(taskID);

  if (held !== undefined) {
    return held;
  }

  const guard = makeSessionGuard(runner.shutdown.signal);

  runner.guards.set(taskID, guard);

  return guard;
}

async function runGuardedStep(
  runner: TaskRunner,
  input: StepInput,
  invalidated: AbortSignal,
): Promise<StepResult> {
  const context = runner.options.context;

  invariant(input.run !== null, `the sandbox runner runs a task run, and ${input.taskID} has none`);

  const taskRun = input.run;

  // The rerun of a step that asked for its report runs no model turn, and it voids the replies the
  // attempt that died left.
  if (taskRun.reportID !== null) {
    await voidLostReplies({ context }, input);

    return {
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: input.sessionBoundary,
    };
  }

  const run = await readStartedRun(runner, input.taskID);
  const usage = await readRunUsage(context, taskRun);

  const limits = taskRun.opened.limits;
  const held = runner.imps.get(input.taskID);

  const plan = planTaskStep({
    used: usage.used,
    limits,
    isImpAwake: held?.getSnapshot().matches('awake') === true,
  });

  if (plan.kind === 'pause') {
    if (plan.isImpReleased && held !== undefined) {
      await releaseTaskImp(held);
    }

    return buildLimitResult(input, buildReachedLimit(plan.meter, usage.used, limits), 'none');
  }

  return runTaskTurn(runner, input, { run, taskRun, invalidated, ...usage });
}

interface TaskTurnParts {
  readonly run: StartedRun;
  readonly taskRun: TaskRun;
  readonly invalidated: AbortSignal;
  readonly used: TaskLimits;
}

async function runTaskTurn(
  runner: TaskRunner,
  input: StepInput,
  parts: TaskTurnParts,
): Promise<StepResult> {
  await renewStaleImp(runner, input.taskID, parts.run.definitionHash);

  const imp = resolveTaskImp(runner, input.taskID);
  const acquired = Promise.withResolvers<TaskImp>();

  imp.send({ type: 'acquire', reply: acquired });

  let held: TaskImp;

  try {
    held = await acquired.promise;
  } catch (error) {
    if (error instanceof SandboxCountsUnreachableError) {
      return holdTaskStep(runner.options.context.clock, input);
    }

    throw error;
  }

  const context = runner.options.context;
  const limits = parts.taskRun.opened.limits;
  const startedAtMs = context.clock.now();

  const meter = createStepMeter(
    { context, gateway: runner.options.gateway, logger: runner.options.log },
    {
      taskRun: parts.taskRun,
      used: parts.used,
      prices: parts.run.profile.profile.prices,
    },
  );

  const begun = await meter.begin(held.sandbox.id);

  if (begun.kind === 'held') {
    return holdTaskStep(runner.options.context.clock, input);
  }

  if (begun.kind === 'limit') {
    await releaseTaskImp(imp);

    return buildLimitResult(input, buildReachedLimit('dollars', begun.used, limits), 'none');
  }

  const budget = begun.budget;

  const ended = await runConversationStep(
    buildTaskRun(runner.options, { ...parts, ...held, budget }),
    {
      ...input,
      interrupt: AbortSignal.any([input.interrupt, budget.signal]),
    },
  )
    .then((result) => ({ result, error: null }))
    .catch((error: unknown) => ({ result: null, error }));

  const spent = await meter.end(
    held.sandbox.id,
    startedAtMs,
    collectCompactionDollars(ended.result?.records ?? []),
  );

  const isPauseRequested = await probePauseRequested(context.log.writer.db, input.taskID);

  const plan = planTaskTurnEnd({
    isLimitReached: spent.isLimitReached,
    isPauseRequested,
    next: ended.result?.next ?? null,
  });

  if (plan.isImpReleased) {
    await releaseTaskImp(imp);
  }

  if (ended.result === null) {
    if (spent.isRefused) {
      return buildLimitResult(input, buildReachedLimit('dollars', spent.used, limits), 'worked');
    }

    throw ended.error;
  }

  return {
    ...ended.result,
    run: {
      activity: 'worked',
      ...(plan.isLimitReached ? { limit: buildReachedLimit('dollars', spent.used, limits) } : {}),
    },
  };
}

// An endpoint keeps the tool list of the version it started with. A task run that pins another
// version gets a new endpoint, and the imp's sandbox carries over by its owner.
async function renewStaleImp(
  runner: TaskRunner,
  taskID: string,
  definitionHash: string | null,
): Promise<void> {
  const held = runner.imps.get(taskID);

  if (
    held === undefined ||
    !runner.endpointHashes.has(taskID) ||
    runner.endpointHashes.get(taskID) === definitionHash
  ) {
    return;
  }

  runner.imps.delete(taskID);
  runner.endpointHashes.delete(taskID);
  held.stop();

  await held.getSnapshot().context.endpoint?.stop();
}

function runCallTask(runner: TaskRunner, input: StepInput): Promise<StepResult> {
  return resolveTaskGuard(runner, input.taskID).withTurn(
    (invalidated) => runCallStep(runner, input, () => runGuardedStep(runner, input, invalidated)),
    { stepKey: input.stepKey, generation: input.lease.generation },
  );
}

function runCallStep(
  runner: TaskRunner,
  input: StepInput,
  runTurn: () => Promise<StepResult>,
): Promise<StepResult> {
  const calls = runner.options.calls;

  invariant(calls !== undefined, `the task ${input.taskID} is a call's, and calls are off`);

  return calls.runStep({ context: runner.options.context, input, runTurn });
}

async function runTaskSessionCleanup(
  runner: TaskRunner,
  cause: SessionCleanupCause,
): Promise<void> {
  try {
    const cleaned = await readCleanedTaskIDs(runner.options.context, cause);

    for (const taskID of cleaned) {
      await resolveTaskGuard(runner, taskID).withInvalidation(async (lastStep, stopping) => {
        await waitForStepEnd(runner.options.context, taskID, lastStep, stopping);
        await cleanTaskSession(runner, taskID, cause);
      });
    }
  } finally {
    // A turn that was in flight can set a pause until it drains, so the clear comes last.
    runner.options.clearFetchPauses();
  }
}

// The invalidation goes in even before the task's first session opens, because the step whose turn
// ended before the forget commits that session only now.
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
  await removeWebFetchThread(context.log, taskID);

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
    const run = await readStartedRun(runner, taskID);

    await runGuestPurge({
      harness: run.harness,
      sandbox: held.sandbox,
      command: run.command,
    });
  } finally {
    await releaseTaskImp(imp);
  }
}
