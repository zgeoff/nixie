import type { JSONObject } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { ApprovedCallRequest, ApprovedReply, ApprovedRun } from '@heynixie/tools';
import type { ActionRow, ActionsTables, OutcomeReason } from '../types';
import type { AttemptCheck } from './attempt-check';
import { buildCancelledCheck } from './build-cancelled-check';
import { buildHeldCheck } from './build-held-check';
import { buildRefusalRecords } from './build-refusal-records';
import { buildUnknownRecords } from './build-unknown-records';
import type { Attempt, Settlement } from './leased-records';
import { buildOutcomeRecord, readArguments, writeLeasedRecords } from './leased-records';
import { readAttemptStep } from './read-attempt-step';
import { isPastDeadline, writeAttemptStarted } from './write-attempt-started';

export interface InStepActionsOptions {
  // Decides the call again before it runs, as an attempt of the action runner does. With none,
  // every call goes ahead.
  readonly checkAttempt?: AttemptCheck;

  // Runs the approved call with the tool run of the step that calls this.
  readonly runCall: (request: ApprovedCallRequest) => Promise<ApprovedRun>;
}

// An action the step settled: the outcome record it wrote, and what its call returned, which no
// record keeps in full. A call that did not run returned nothing.
export interface InStepSettled {
  readonly actionID: string;
  readonly outcomeSequence: number;
  readonly reply: ApprovedReply | null;
}

// Runs each approved call of the task that its step runs, in the order they were queued, under the
// step's lease, which stays with the step. An action starts its attempt in its own transaction
// before the call runs, so an attempt that a crash left open settles unknown and never reruns.
export async function runInStepActions(
  context: TasksContext,
  lease: Lease,
  options: InStepActionsOptions,
): Promise<readonly InStepSettled[]> {
  const rows = await readInStepActions(context, lease.workID);

  const settled: InStepSettled[] = [];

  for (const action of rows) {
    const result = await runInStepAction(context, { lease, action }, options);

    if (result !== null) {
      settled.push(result);
    }
  }

  return settled;
}

// Whether the task holds an approved call that its next step has to run. A held action waits for
// its proposal, a cancelled one never runs, and an unknown one waits for the owner.
export async function probeInStepActionPending(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<boolean> {
  const rows = await readInStepActions(context, taskID);

  return rows.length > 0;
}

function readInStepActions(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<readonly ActionRow[]> {
  return context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
    .selectAll('actions')
    .where('actions.task_id', '=', taskID)
    .where('actions.runs_in_step', '=', 1)
    .where('actions.status', '=', 'pending')
    .where('actions.held_by_proposal_id', 'is', null)
    .where((eb) => eb.not(buildCancelledCheck(eb)))
    .where((eb) => eb.not(buildHeldCheck(eb)))
    .orderBy('actions.queued_sequence')
    .execute();
}

type Claimed = Omit<Attempt, 'attempt'>;

async function runInStepAction(
  context: TasksContext,
  claimed: Claimed,
  options: InStepActionsOptions,
): Promise<InStepSettled | null> {
  const action = claimed.action;

  if (action.attempt_open === 1) {
    return writeUnknown(context, claimed);
  }

  const attempt = { ...claimed, attempt: action.attempt_count + 1 };

  const args = await readArguments(context, action.queued_sequence);

  if (args === null || action.call_sequence === null) {
    return writeFailure(context, attempt, 'arguments_unreadable', {});
  }

  if (isPastDeadline(action, context.clock.now())) {
    return writeFailure(context, attempt, 'deadline_passed', {
      message: 'the action passed its deadline',
    });
  }

  const step = await readAttemptStep(options.checkAttempt, { action, arguments: args });

  if (step.kind !== 'go') {
    const [sequence] = await writeLeasedRecords(context, attempt.lease, {
      records: buildRefusalRecords(context, attempt, step),
      reset: false,
    });

    return step.kind === 'deny' && sequence !== undefined
      ? { actionID: action.action_id, outcomeSequence: sequence, reply: null }
      : null;
  }

  const start = await writeAttemptStarted(context, attempt, { resetWhenBarred: false });

  if (start === 'past_deadline') {
    return writeFailure(context, attempt, 'deadline_passed', {
      message: 'the action passed its deadline',
    });
  }

  if (start === 'barred') {
    return null;
  }

  const run = await options.runCall({
    actionID: action.action_id,
    tool: action.tool,
    input: args,
    callSequence: action.call_sequence,
    actionHash: action.action_hash,
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.before', { kind: 'action', id: action.action_id });
  }

  return writeRunOutcome(context, attempt, run);
}

// An attempt with no result may have run the call, so the owner decides: the call never reruns on
// its own.
async function writeUnknown(
  context: TasksContext,
  claimed: Claimed,
): Promise<InStepSettled | null> {
  const action = claimed.action;

  const records = buildUnknownRecords(context, {
    action,
    attempt: action.attempt_count,
    reason: 'attempt_without_result',
    details: {},
    connector: undefined,
    now: context.clock.now(),
  });

  const sequences = await writeLeasedRecords(context, claimed.lease, { records, reset: false });

  const sequence = sequences.at(-1);

  return sequence === undefined
    ? null
    : { actionID: action.action_id, outcomeSequence: sequence, reply: null };
}

function writeFailure(
  context: TasksContext,
  attempt: Attempt,
  reason: OutcomeReason,
  details: JSONObject,
): Promise<InStepSettled | null> {
  return writeSettlement(
    context,
    attempt,
    { outcome: { status: 'failed', reason }, details },
    null,
  );
}

async function writeSettlement(
  context: TasksContext,
  attempt: Attempt,
  settlement: Settlement,
  reply: ApprovedReply | null,
): Promise<InStepSettled | null> {
  const [sequence] = await writeLeasedRecords(context, attempt.lease, {
    records: [buildOutcomeRecord(context, attempt, settlement)],
    reset: false,
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.after', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }

  return sequence === undefined
    ? null
    : { actionID: attempt.action.action_id, outcomeSequence: sequence, reply };
}

function writeRunOutcome(
  context: TasksContext,
  attempt: Attempt,
  run: ApprovedRun,
): Promise<InStepSettled | null> {
  if (run.status === 'done') {
    return writeSettlement(
      context,
      attempt,
      { outcome: { status: 'done' }, resultSequence: run.resultSequence },
      { result: run.result, images: run.images },
    );
  }

  if (run.status === 'failed') {
    return writeSettlement(
      context,
      attempt,
      { outcome: { status: 'failed', reason: 'refused' }, resultSequence: run.resultSequence },
      null,
    );
  }

  const reason = run.status === 'unavailable' ? 'unknown_tool' : 'arguments_unreadable';

  return writeFailure(context, attempt, reason, {});
}
