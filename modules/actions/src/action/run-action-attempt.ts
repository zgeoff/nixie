import type { ActionConnector, ProviderResponse } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import {
  LeaseLostError,
  probeTaskPaused,
  requireLease,
  resetLease,
  startLeaseRenewal,
  waitAtFaultPoint,
} from '@heynixie/tasks';
import type { ActionRow, ActionsTables, OutcomeReason } from '../types';
import type { ActionAttemptOptions } from './action-attempt-options';
import type { AttemptVerdict } from './attempt-check';
import { buildCancelledCheck } from './build-cancelled-check';
import { buildHeldCheck } from './build-held-check';
import { buildUnknownRecords } from './build-unknown-records';
import { defaultRetryDelaysMs } from './default-retry-delays-ms';
import type { Attempt, Settlement } from './leased-records';
import { buildOutcomeRecord, readArguments, writeLeasedRecords } from './leased-records';
import { pickAttemptStep } from './pick-attempt-step';
import { pickOutcome } from './pick-outcome';
import { runReconcileCheck } from './run-reconcile-check';

export async function runActionAttempt(
  context: TasksContext,
  lease: Lease,
  options: ActionAttemptOptions,
): Promise<void> {
  const action = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .selectAll()
    .where('action_id', '=', lease.workID)
    .executeTakeFirstOrThrow();

  try {
    if (action.status === 'unknown') {
      await runReconcileCheck(context, { lease, action }, options);
    } else if (action.attempt_open === 1) {
      await writeUnknown(context, { lease, action }, options, {
        reason: 'attempt_without_result',
        details: {},
      });
    } else {
      await runAttempt(context, { lease, action }, options);
    }
  } catch (error) {
    if (!(error instanceof LeaseLostError)) {
      throw error;
    }
  }
}

interface UnknownResult {
  readonly reason: OutcomeReason;
  readonly details: JSONObject;

  // absent when the claim found an attempt with no result
  readonly attempt?: number;
}

// An unknown outcome is settled by what the connector declares: a retry under the same key, a
// read-only check, or the owner's answer.
async function writeUnknown(
  context: TasksContext,
  claimed: Omit<Attempt, 'attempt'>,
  options: ActionAttemptOptions,
  unknown: UnknownResult,
): Promise<void> {
  const attempt = {
    ...claimed,
    attempt: unknown.attempt ?? claimed.action.attempt_count,
  };

  const records = buildUnknownRecords(context, {
    action: claimed.action,
    attempt: attempt.attempt,
    reason: unknown.reason,
    details: unknown.details,
    connector: options.connectors.get(claimed.action.tool),
    now: context.clock.now(),
  });

  await writeLeasedRecords(context, claimed.lease, { records, reset: true });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.after', {
      kind: 'action',
      id: claimed.action.action_id,
    });

    await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: claimed.action.task_id });
  }
}

export async function writeOutcome(
  context: TasksContext,
  attempt: Attempt,
  settlement: Settlement,
): Promise<void> {
  const actionID = attempt.action.action_id;

  await writeLeasedRecords(context, attempt.lease, {
    records: [buildOutcomeRecord(context, attempt, settlement)],
    reset: true,
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.after', { kind: 'action', id: actionID });
    await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: attempt.action.task_id });
  }
}

async function runAttempt(
  context: TasksContext,
  claimed: Omit<Attempt, 'attempt'>,
  options: ActionAttemptOptions,
): Promise<void> {
  const attempt = { ...claimed, attempt: claimed.action.attempt_count + 1 };
  const connector = options.connectors.get(claimed.action.tool);

  const args = await readArguments(context, claimed.action.queued_sequence);

  if (connector === undefined || args === null) {
    const reason = connector === undefined ? 'unknown_tool' : 'arguments_unreadable';

    await writeOutcome(context, attempt, { outcome: { status: 'failed', reason } });

    return;
  }

  if (isPastDeadline(claimed.action, context.clock.now())) {
    await writeFailure(context, attempt, 'deadline_passed', 'the action passed its deadline');

    return;
  }

  const verdict: AttemptVerdict =
    options.checkAttempt === undefined
      ? { kind: 'go', destinations: [] }
      : await options.checkAttempt({
          action: claimed.action,
          arguments: args,
          proposalID:
            claimed.action.is_approved === 1 ? crypto.randomUUID() : claimed.action.action_id,
        });

  const step = pickAttemptStep(verdict, claimed.action);

  if (step.kind === 'deny') {
    await writeOutcome(context, attempt, {
      outcome: { status: 'failed', reason: 'rule_denied' },
      details: { message: step.verdict.message },
      rule: step.verdict.rule,
    });

    return;
  }

  if (step.kind === 'hold') {
    await writeLeasedRecords(context, attempt.lease, {
      records: [
        step.verdict.record,
        {
          kind: 'action.held',
          definitions: context.definitions(),
          thread: claimed.action.task_id,
          payload: { actionID: claimed.action.action_id, proposalID: step.verdict.proposalID },
        },
      ],
      reset: true,
    });

    return;
  }

  const isStarted = await writeAttemptStarted(context, attempt);

  if (!isStarted) {
    return;
  }

  const response = await runConnector(context, attempt, {
    connector,
    args,
    destinations: step.destinations,
    options,
  });

  await writeAttemptResult(context, attempt, {
    response,
    connector,
    retryDelaysMs: connector.retryDelaysMs ?? defaultRetryDelaysMs,
    options,
  });
}

function isPastDeadline(action: ActionRow, now: number): boolean {
  return action.deadline_at !== null && now >= action.deadline_at;
}

function writeFailure(
  context: TasksContext,
  attempt: Attempt,
  reason: OutcomeReason,
  message: string,
): Promise<void> {
  return writeOutcome(context, attempt, {
    outcome: { status: 'failed', reason },
    details: { message },
  });
}

// A stop, a pause, a close or a pause of all of nixie can commit between the claim and the attempt's
// start, so the start reads the cancel, the hold and the nixie pause again in its own transaction,
// and frees the lease of an action that must not start.
async function writeAttemptStarted(context: TasksContext, attempt: Attempt): Promise<boolean> {
  const isStarted = await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, attempt.lease, context.clock.now());

    const action = await tx
      .$extendTables<ActionsTables>()
      .selectFrom('actions')
      .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
      .select((eb) => eb.or([buildCancelledCheck(eb), buildHeldCheck(eb)]).as('is_barred'))
      .select('actions.held_by_proposal_id')
      .where('actions.action_id', '=', attempt.action.action_id)
      .executeTakeFirstOrThrow();

    const isPaused = await probeTaskPaused(tx, attempt.action.task_id);

    const isBarred = action.is_barred === 1 || action.is_barred === true;

    if (isBarred || isPaused || action.held_by_proposal_id !== null) {
      await resetLease(tx, attempt.lease);

      return false;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'action.attempt_started',
        definitions: context.definitions(),
        thread: attempt.action.task_id,
        payload: { actionID: attempt.action.action_id, attempt: attempt.attempt },
      },
    ]);

    return true;
  });

  if (isStarted && NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.record.after', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }

  return isStarted;
}

interface ConnectorCall {
  readonly connector: ActionConnector;
  readonly args: JSONObject;
  readonly destinations: readonly string[];
  readonly options: ActionAttemptOptions;
}

// A call that throws may have reached the provider, so it counts as an ambiguity.
async function runConnector(
  context: TasksContext,
  attempt: Attempt,
  call: ConnectorCall,
): Promise<ProviderResponse> {
  const renewal = startLeaseRenewal(context, attempt.lease, call.options.leaseMs);

  try {
    return await call.connector.run({
      actionID: attempt.action.action_id,
      tool: attempt.action.tool,
      arguments: call.args,
      attempt: attempt.attempt,
      idempotencyKey: attempt.action.action_id,
      destinations: call.destinations,
    });
  } catch (error) {
    return { kind: 'ambiguous', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await renewal.stop();
  }
}

interface AttemptResult {
  readonly response: ProviderResponse;
  readonly connector: ActionConnector;
  readonly retryDelaysMs: readonly number[];
  readonly options: ActionAttemptOptions;
}

async function writeAttemptResult(
  context: TasksContext,
  attempt: Attempt,
  result: AttemptResult,
): Promise<void> {
  const outcome = pickOutcome(result.response, attempt.attempt, result.retryDelaysMs);
  const details = toDetails(result.response);

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.before', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }

  if (outcome.status === 'unknown') {
    await writeUnknown(context, attempt, result.options, {
      reason: outcome.reason,
      details,
      attempt: attempt.attempt,
    });

    return;
  }

  if (outcome.status !== 'pending') {
    await writeOutcome(context, attempt, { outcome, details });

    return;
  }

  await writeLeasedRecords(context, attempt.lease, {
    records: [
      {
        kind: 'action.retry_scheduled',
        definitions: context.definitions(),
        thread: attempt.action.task_id,
        payload: {
          actionID: attempt.action.action_id,
          attempt: attempt.attempt,
          nextAttemptAt: context.clock.now() + outcome.delayMs,
          reason: outcome.reason,
        },
        erasable: details,
      },
    ],
    reset: true,
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.after', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }
}

function toDetails(response: ProviderResponse): JSONObject {
  return response.kind === 'success' ? { result: response.result } : { message: response.reason };
}
