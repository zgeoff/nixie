import type { JSONObject, RecordInput } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import {
  LeaseLostError,
  requireLease,
  resetLease,
  startLeaseRenewal,
  waitAtFaultPoint,
} from '@heynixie/tasks';
import { defaultRetryDelaysMs } from './default-retry-delays-ms';
import { isJSONObject } from './is-json-object';
import { pickOutcome } from './pick-outcome';
import type { ActionConnector, ActionRow, ActionsTables, Outcome, ProviderResponse } from './types';

export interface ActionAttemptOptions {
  readonly connectors: ReadonlyMap<string, ActionConnector>;
  readonly leaseMs: number;
}

// Runs one attempt of a claimed action: an attempt record, the provider call, then the result and
// outcome together. A claim that finds an attempt record with no result marks the action unknown
// first, never a plain second attempt, because the call may have reached the provider.
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
    await (action.attempt_open === 1
      ? writeOutcome(
          context,
          { lease, action, attempt: action.attempt_count },
          { outcome: attemptWithoutResult },
        )
      : runAttempt(context, { lease, action }, options));
  } catch (error) {
    if (!(error instanceof LeaseLostError)) {
      throw error;
    }
  }
}

const attemptWithoutResult: SettledOutcome = {
  status: 'unknown',
  reason: 'attempt_without_result',
};

interface Attempt {
  readonly lease: Lease;
  readonly action: ActionRow;
  readonly attempt: number;
}

type SettledOutcome = Exclude<Outcome, { readonly status: 'pending' }>;

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
  await writeAttemptStarted(context, attempt);

  const response = await runConnector(context, attempt, { connector, args, options });

  await writeAttemptResult(context, attempt, {
    response,
    retryDelaysMs: connector.retryDelaysMs ?? defaultRetryDelaysMs,
  });
}

// the arguments sit in the queued record's erasable fields, so a forgotten action has none
async function readArguments(context: TasksContext, sequence: number): Promise<JSONObject | null> {
  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });
  const erasable = entry?.record.erasable;
  const args = erasable?.status === 'readable' ? erasable.fields['arguments'] : undefined;

  return isJSONObject(args) ? args : null;
}

// stage 1: the attempt record commits before the provider call
async function writeAttemptStarted(context: TasksContext, attempt: Attempt): Promise<void> {
  await writeLeasedRecord(context, attempt.lease, {
    record: {
      kind: 'action.attempt_started',
      definitions: context.definitions(),
      thread: attempt.action.task_id,
      payload: { actionID: attempt.action.action_id, attempt: attempt.attempt },
    },
    reset: false,
  });
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.record.after', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }
}

interface ConnectorCall {
  readonly connector: ActionConnector;
  readonly args: JSONObject;
  readonly options: ActionAttemptOptions;
}

// stage 2: the provider call, under a renewed lease; a call that throws may have reached the
// provider, so it counts as an ambiguity
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
    });
  } catch (error) {
    return { kind: 'ambiguous', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await renewal.stop();
  }
}

interface AttemptResult {
  readonly response: ProviderResponse;
  readonly retryDelaysMs: readonly number[];
}

// stage 3: the result and the outcome commit together; a refusal that can clear waits for its
// next attempt, and any other outcome settles the action and reaches the task's inbox
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
  if (outcome.status !== 'pending') {
    await writeOutcome(context, attempt, { outcome, details });
    return;
  }
  await writeLeasedRecord(context, attempt.lease, {
    record: {
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

interface Settlement {
  readonly outcome: SettledOutcome;

  // the connector's result or the provider's reason, free text kept in the erasable fields
  readonly details?: JSONObject;
}

// settles the action: its outcome record lands in the task's inbox and wakes the task
async function writeOutcome(
  context: TasksContext,
  attempt: Attempt,
  settlement: Settlement,
): Promise<void> {
  const actionID = attempt.action.action_id;
  const outcome = settlement.outcome;

  await writeLeasedRecord(context, attempt.lease, {
    record: {
      kind: 'action.outcome',
      definitions: context.definitions(),
      thread: attempt.action.task_id,
      payload: {
        actionID,
        status: outcome.status,
        attempt: attempt.attempt,
        reason: outcome.status === 'done' ? null : outcome.reason,
      },
      erasable: settlement.details ?? {},
    },
    reset: true,
  });
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.result.after', { kind: 'action', id: actionID });
    await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: attempt.action.task_id });
  }
}

interface LeasedRecord {
  readonly record: RecordInput;

  // frees the lease in the same transaction, once the attempt has nothing left to commit
  readonly reset: boolean;
}

// one write under the lease: a runner whose lease expired or was taken commits nothing
async function writeLeasedRecord(
  context: TasksContext,
  lease: Lease,
  leased: LeasedRecord,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, lease, context.clock.now());
    await writeRecordsInTransaction(tx, context.log, [leased.record]);
    if (leased.reset) {
      await resetLease(tx, lease);
    }
  });
}
