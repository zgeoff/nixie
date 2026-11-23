import { removeSummaryKeys } from '@heynixie/compaction';
import { removeWebFetchThread } from '@heynixie/connectors';
import { subscribeToRecordCommits, writeRecords } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { ResolvedProfile } from '@heynixie/models';
import {
  bindHarness,
  deriveModelSecret,
  modelSessionCleanupCompletedCodec,
  modelSessionInvalidatedCodec,
  resolveModelCredentials,
} from '@heynixie/models';
import type { GrantSpec } from '@heynixie/sandbox';
import { readSandboxOwners } from '@heynixie/sandbox';
import type { RunStep, StepInput, StepResult, TaskLimits, TaskRun } from '@heynixie/tasks';
import {
  buildStepRunID,
  conversationTaskID,
  probePauseRequested,
  readStartedTaskIDs,
  startClaimPool,
  taskReportToolName,
} from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { Actor } from 'xstate';
import { createActor } from 'xstate';
import type { TaskImp, TaskImpParts } from '../sandbox/task-imp-machine';
import { taskImpMachine } from '../sandbox/task-imp-machine';
import { runConversationStep } from '../step/run-conversation-step';
import { voidLostReplies } from '../step/void-lost-replies';
import { silentEndToolName } from '../turn/build-silent-end-tool';
import type { SessionCleanupCause } from '../types';
import { createWorkerSandbox } from '../utils/create-worker-sandbox';
import type { SessionGuard } from '../utils/make-session-guard';
import { makeSessionGuard } from '../utils/make-session-guard';
import { runGuestPurge } from '../utils/run-guest-purge';
import { waitForStepEnd } from '../utils/wait-for-step-end';
import { buildReachedLimit } from './build-reached-limit';
import { buildSpendRecord } from './build-spend-record';
import { buildTaskRun } from './build-task-run';
import { createCallBudget } from './create-call-budget';
import { getHarnessImage } from './get-harness-image';
import type { SystemTaskSession } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { isGuestPurged } from './pick-cleaned-task-ids';
import { planTaskStep } from './plan-task-step';
import { planTaskTurnEnd } from './plan-task-turn-end';
import { readCleanedTaskIDs } from './read-cleaned-task-ids';
import { readLateSpend } from './read-late-spend';
import { readRunUsage } from './read-run-usage';
import type { StartedRun } from './read-started-run';
import { readStartedRun } from './read-started-run';
import { releaseTaskImp } from './release-task-imp';
import { removeTaskSandboxes } from './remove-task-sandboxes';
import type { SandboxRunnerOptions } from './sandbox-runner-options';
import { writeTaskTurnSpend } from './write-task-turn-spend';

export interface SandboxRunner {
  readonly runStep: RunStep;

  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;
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
}

export const startSandboxRunner = makeSystemTaskRunner<SandboxRunnerOptions, SandboxRunner>({
  role: 'task',
  entry: 'turn',
  start: async (options, session) => {
    const runner: TaskRunner = {
      options,
      session,
      profiles: resolveModelCredentials(options.models, options.secrets),
      grants: new Map(),
      imps: new Map(),
      endpointHashes: new Map(),
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
  const secret = deriveModelSecret(profile, bindHarness(profile.profile));

  try {
    await runner.options.sandboxes.addSecret(secret);
  } catch (error) {
    runner.grants.delete(profile.profile.id);
    throw error;
  }

  return bindHarness(profile.profile).buildGrant(secret);
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

  const ended = await readStartedTaskIDs(options.context, {
    end: 'ended',
    among: [...new Set([...owners, ...runner.imps.keys()])],
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

      // The start's record lists only the tools it named, and every task also gets silent end and report.
      return options.tools.startRun({
        runID: taskID,
        thread: taskID,
        logThread: run.options.log === 'conversation' ? conversationTaskID : taskID,
        tools: [...new Set([...run.options.tools, silentEndToolName, taskReportToolName])],
        model: run.model,
        ...(run.hasSelfNoteGrant
          ? { hasSelfNoteGrant: true, selfNoteOnlyTools: run.selfNoteOnlyTools }
          : {}),
        toolUseMetaKey: run.harness.toolUseMetaKey,
      });
    },
    readSandbox: (id) => options.sandboxes.read(id),
    createSandbox: async () => {
      const run = await readStartedRun(runner, taskID);

      return createWorkerSandbox({
        sandboxes: options.sandboxes,
        image: getHarnessImage(options.images, run.harness.imageKey),
        owner: taskID,
        limits: runner.session.limits,
        modelGrant: await resolveModelGrant(runner, run.profile),
        log: options.log,
      });
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

    // The step had work when its runner claimed it, so the task keeps that work for the raise.
    return {
      next: 'continue',
      records: [],
      acknowledged: [],
      sessionBoundary: input.sessionBoundary,
      run: {
        activity: 'none',
        limit: buildReachedLimit(plan.meter, usage.used, limits),
      },
    };
  }

  return runTaskTurn(runner, input, { run, taskRun, invalidated, ...usage });
}

interface TaskTurnParts {
  readonly run: StartedRun;
  readonly taskRun: TaskRun;
  readonly invalidated: AbortSignal;
  readonly used: TaskLimits;
  readonly throughSequence: number;
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

  const held = await acquired.promise;

  const run = parts.run;
  const context = runner.options.context;
  const limits = parts.taskRun.opened.limits;

  const budget = createCallBudget(
    run.profile.profile.prices,
    limits.dollars - parts.used.dollars,
    () => readLateSpend(context, parts.taskRun, parts.throughSequence, buildStepRunID(input)),
  );

  const ended = await runConversationStep(
    buildTaskRun(runner.options, { ...parts, ...held, budget }),
    {
      ...input,
      interrupt: AbortSignal.any([input.interrupt, budget.signal]),
    },
  ).then(
    (result) => ({ result, error: null }),
    (error: unknown) => ({ result: null, error }),
  );

  const isPauseRequested = await probePauseRequested(context.log.writer.db, input.taskID);

  const plan = planTaskTurnEnd({
    isBudgetReached: budget.signal.aborted,
    spentDollars: budget.getSpentDollars(),
    isPauseRequested,
    next: ended.result?.next ?? null,
  });

  if (plan.isImpReleased) {
    await releaseTaskImp(imp);
  }

  await writeTaskTurnSpend(
    { ...context, logger: runner.options.log },
    { taskID: input.taskID, taskRunID: parts.taskRun.runID },
    plan,
  );

  if (ended.result === null) {
    throw ended.error;
  }

  // The turn's records underprice a turn cut short, so its commit carries the budget's tally.
  return {
    ...ended.result,
    records:
      plan.limitDollars === null
        ? ended.result.records
        : [
            ...ended.result.records,
            buildSpendRecord(context, {
              taskID: input.taskID,
              taskRunID: parts.taskRun.runID,
              dollars: plan.limitDollars,
            }),
          ],
    ...(plan.commitDollars === null ? {} : { spentDollars: plan.commitDollars }),
    run: {
      activity: 'worked',
      ...(plan.isLimitReached
        ? {
            limit: buildReachedLimit(
              'dollars',
              {
                turns: parts.used.turns,
                dollars: parts.used.dollars + budget.getSpentDollars(),
              },
              limits,
            ),
          }
        : {}),
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

async function runTaskSessionCleanup(
  runner: TaskRunner,
  cause: SessionCleanupCause,
): Promise<void> {
  try {
    const cleaned = await readCleanedTaskIDs(runner.options.context, cause);

    for (const taskID of cleaned) {
      await resolveTaskGuard(runner, taskID).withInvalidation(async (lastStep) => {
        await waitForStepEnd(runner.options.context, taskID, lastStep);
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
