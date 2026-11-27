import type { ActionConnector, ProviderResponse } from '@heynixie/connectors';
import type { JSONObject } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import { LeaseLostError, startLeaseRenewal, waitAtFaultPoint } from '@heynixie/tasks';
import type { ActionsTables, OutcomeReason } from '../types';
import type { ActionAttemptOptions } from './action-attempt-options';
import { buildAttemptKey } from './build-attempt-key';
import { buildUnknownRecords } from './build-unknown-records';
import { defaultRetryDelaysMs } from './default-retry-delays-ms';
import { isKeyExpired } from './is-key-expired';
import type { Attempt, QueuedCall, Settlement } from './leased-records';
import { buildOutcomeRecord, readQueuedCall, writeLeasedRecords } from './leased-records';
import { pickOutcome } from './pick-outcome';
import { readAttemptStep } from './read-attempt-step';
import { runReconcileCheck } from './run-reconcile-check';
import { isPastDeadline, writeAttemptStarted } from './write-attempt-started';
import { writeRefusalUnlessHeld } from './write-refusal-unless-held';

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

  // when the attempt started, which the claimed row predates
  readonly startedAt?: number;
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

  const lastAttemptAt = unknown.startedAt ?? claimed.action.last_attempt_at;

  const records = buildUnknownRecords(context, {
    action: {
      ...claimed.action,
      last_attempt_at: lastAttemptAt,
      first_attempt_at: claimed.action.first_attempt_at ?? lastAttemptAt,
    },
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

async function runAttempt(
  context: TasksContext,
  claimed: Omit<Attempt, 'attempt'>,
  options: ActionAttemptOptions,
): Promise<void> {
  const attempt = { ...claimed, attempt: claimed.action.attempt_count + 1 };
  const connector = options.connectors.get(claimed.action.tool);

  const queued = await readQueuedCall(context, claimed.action);

  if (connector === undefined || queued === null) {
    const reason = connector === undefined ? 'unknown_tool' : 'arguments_unreadable';

    await writeOutcome(context, attempt, { outcome: { status: 'failed', reason } });

    return;
  }

  if (isPastDeadline(claimed.action, context.clock.now())) {
    await writeFailure(context, attempt, 'deadline_passed', 'the action passed its deadline');

    return;
  }

  if (isKeyExpired(claimed.action, connector, context.clock.now())) {
    await writeOutcome(
      context,
      { ...attempt, attempt: claimed.action.attempt_count },
      {
        outcome: { status: 'unknown', reason: 'ambiguous' },
        ownerReason: 'key_expired',
      },
    );

    return;
  }

  const step = await readAttemptStep(options.checkAttempt, {
    action: claimed.action,
    arguments: queued.arguments,
  });

  if (step.kind !== 'go') {
    const isWritten = await writeRefusalUnlessHeld(context, attempt, step, options.proposalConfig);

    if (isWritten && step.kind === 'deny' && NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('attempt.result.after', {
        kind: 'action',
        id: claimed.action.action_id,
      });

      await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: claimed.action.task_id });
    }

    return;
  }

  const start = await writeAttemptStarted(context, attempt, {
    resetWhenBarred: true,
    readHeldToolPrefixes: options.readHeldToolPrefixes,
    admitTool: options.admitTool,
  });

  if (start.kind === 'past_deadline') {
    await writeFailure(context, attempt, 'deadline_passed', 'the action passed its deadline');

    return;
  }

  if (start.kind === 'barred') {
    return;
  }

  const startedAt = context.clock.now();

  const response = await start.admission
    .run(async () => {
      const actsFailure = await writeActs(step.writeActs);

      if (actsFailure !== null) {
        return actsFailure;
      }

      return runConnector(context, attempt, {
        connector,
        queued,
        destinations: step.destinations,
        replyTargets: step.replyTargets,
        startedAt,
        options,
      });
    })
    .finally(start.admission.release);

  await writeAttemptResult(context, attempt, {
    response,
    connector,
    retryDelaysMs: connector.retryDelaysMs ?? defaultRetryDelaysMs,
    startedAt,
    options,
  });
}

async function writeOutcome(
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

// The provider has not run when the acts fail to write, so the attempt ends as a refusal that a
// later attempt can clear.
async function writeActs(
  write: (() => Promise<void>) | undefined,
): Promise<ProviderResponse | null> {
  try {
    await write?.();

    return null;
  } catch (error) {
    return {
      kind: 'refused_retryable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

interface ConnectorCall {
  readonly connector: ActionConnector;
  readonly queued: QueuedCall;
  readonly destinations: readonly string[];
  readonly replyTargets: readonly string[];
  readonly startedAt: number;
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
      arguments: call.queued.arguments,
      snapshotHash: call.queued.snapshotHash,
      attempt: attempt.attempt,
      idempotencyKey: buildAttemptKey(attempt.action),
      destinations: call.destinations,
      replyTargets: call.replyTargets,
      attemptStartedAt: call.startedAt,
      queuedAt: call.queued.queuedAtMs,
      actionHash: attempt.action.action_hash,
      deadlineAt: attempt.action.deadline_at,
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
  readonly startedAt: number;
  readonly options: ActionAttemptOptions;
}

async function writeAttemptResult(
  context: TasksContext,
  attempt: Attempt,
  result: AttemptResult,
): Promise<void> {
  const outcome = pickOutcome(result.response, attempt.attempt, result.retryDelaysMs);
  const details = toDetails(result.response);
  const attachments = toAttachments(result.response);

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
      startedAt: result.startedAt,
    });

    return;
  }

  if (outcome.status !== 'pending') {
    await writeOutcome(context, attempt, {
      outcome,
      details,
      ...(attachments.length === 0 ? {} : { attachments }),
    });

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

// The media type of each picture stays in the outcome's erasable fields, and the bytes are its
// attachments, so a forget erases both.
function toDetails(response: ProviderResponse): JSONObject {
  if (response.kind !== 'success') {
    return { message: response.reason };
  }

  const images = response.images ?? [];

  return images.length === 0
    ? { result: response.result }
    : { result: response.result, imageTypes: images.map((image) => image.mediaType) };
}

function toAttachments(response: ProviderResponse): Uint8Array<ArrayBuffer>[] {
  return response.kind === 'success'
    ? (response.images ?? []).map((image) => new Uint8Array(image.bytes))
    : [];
}
