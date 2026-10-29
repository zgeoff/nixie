import type { ActionConnector, ProviderResponse } from '@heynixie/connectors';
import type { JSONObject, RecordInput } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { planBackoffDelay } from '@heynixie/retry';
import type { Lease, TasksContext } from '@heynixie/tasks';
import {
  LeaseLostError,
  requireLease,
  resetLease,
  startLeaseRenewal,
  waitAtFaultPoint,
} from '@heynixie/tasks';
import { buildCancelledCheck } from './build-cancelled-check';
import { buildHeldCheck } from './build-held-check';
import { isJSONObject } from './is-json-object';
import { pickOutcome } from './pick-outcome';
import type { ActionRow, ActionsTables, Outcome } from './types';

export interface ActionAttemptOptions {
  readonly connectors: ReadonlyMap<string, ActionConnector>;
  readonly leaseMs: number;
}

type SettledOutcome = Exclude<Outcome, { readonly status: 'pending' }>;

const attemptWithoutResult: SettledOutcome = {
  status: 'unknown',
  reason: 'attempt_without_result',
};

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

interface Settlement {
  readonly outcome: SettledOutcome;

  readonly details?: JSONObject;
}

interface Attempt {
  readonly lease: Lease;
  readonly action: ActionRow;
  readonly attempt: number;
}

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

  readonly reset: boolean;
}

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

export const defaultRetryDelaysMs: readonly number[] = [1, 2, 3, 4].map((failures) =>
  planBackoffDelay(failures, { firstMs: 30_000, maxMs: 1_800_000, factor: 4 }),
);

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

  const isStarted = await writeAttemptStarted(context, attempt);

  if (!isStarted) {
    return;
  }

  const response = await runConnector(context, attempt, { connector, args, options });

  await writeAttemptResult(context, attempt, {
    response,
    retryDelaysMs: connector.retryDelaysMs ?? defaultRetryDelaysMs,
  });
}

async function readArguments(context: TasksContext, sequence: number): Promise<JSONObject | null> {
  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  const erasable = entry?.record.erasable;
  const args = erasable?.status === 'readable' ? erasable.fields['arguments'] : undefined;

  return isJSONObject(args) ? args : null;
}

// A stop, a pause or a close can commit between the claim and the attempt's start, so the start
// reads the cancel and the hold again in its own transaction, and frees the lease of an action that
// must not start.
async function writeAttemptStarted(context: TasksContext, attempt: Attempt): Promise<boolean> {
  const isStarted = await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, attempt.lease, context.clock.now());

    const action = await tx
      .$extendTables<ActionsTables>()
      .selectFrom('actions')
      .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
      .select((eb) => eb.or([buildCancelledCheck(eb), buildHeldCheck(eb)]).as('is_barred'))
      .where('actions.action_id', '=', attempt.action.action_id)
      .executeTakeFirstOrThrow();

    if (action.is_barred === 1 || action.is_barred === true) {
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
