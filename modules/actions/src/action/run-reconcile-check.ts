import type { ActionConnector, CheckResponse } from '@heynixie/connectors';
import type { JSONObject, RecordInput } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import { startLeaseRenewal } from '@heynixie/tasks';
import type { ActionRow } from '../types';
import type { ActionAttemptOptions } from './action-attempt-options';
import { buildAttemptKey } from './build-attempt-key';
import { defaultRetryDelaysMs } from './default-retry-delays-ms';
import { buildOutcomeRecord, readArguments, writeLeasedRecords } from './leased-records';
import { pickCheckStep } from './pick-check-step';
import type { CheckStep } from './pick-check-step';

interface Claimed {
  readonly lease: Lease;
  readonly action: ActionRow;
}

// Runs the read-only check of an action whose outcome is unknown. The check never writes to the
// provider, so a crash in the middle leaves the check to run again.
export async function runReconcileCheck(
  context: TasksContext,
  claimed: Claimed,
  options: ActionAttemptOptions,
): Promise<void> {
  const action = claimed.action;
  const connector = options.connectors.get(action.tool);

  const args = await readArguments(context, action.queued_sequence);

  const response = await runCheck(context, claimed, {
    connector,
    args,
    leaseMs: options.leaseMs,
  });

  const retryDelaysMs = connector?.retryDelaysMs ?? defaultRetryDelaysMs;

  const step = pickCheckStep(response, {
    reconcile: connector?.reconcile,
    hasRetryLeft: retryDelaysMs[action.attempt_count - 1] !== undefined,
  });

  await writeLeasedRecords(context, claimed.lease, {
    records: buildCheckRecords(context, action, step),
    reset: true,
  });
}

interface CheckCall {
  readonly connector: ActionConnector | undefined;
  readonly args: JSONObject | null;
  readonly leaseMs: number;
}

async function runCheck(
  context: TasksContext,
  claimed: Claimed,
  call: CheckCall,
): Promise<CheckResponse> {
  const check = call.connector?.check;

  if (check === undefined || call.args === null) {
    return { kind: 'inconclusive' };
  }

  const renewal = startLeaseRenewal(context, claimed.lease, call.leaseMs);

  try {
    return await check({
      actionID: claimed.action.action_id,
      tool: claimed.action.tool,
      arguments: call.args,
      attempt: claimed.action.attempt_count,
      idempotencyKey: buildAttemptKey(claimed.action),
      destinations: [],
      actionHash: claimed.action.action_hash,
      deadlineAt: claimed.action.deadline_at,
    });
  } catch {
    return { kind: 'inconclusive' };
  } finally {
    await renewal.stop();
  }
}

function buildCheckRecords(
  context: TasksContext,
  action: ActionRow,
  step: CheckStep,
): RecordInput[] {
  const checked: RecordInput = {
    kind: 'action.reconcile_checked',
    definitions: context.definitions(),
    thread: action.task_id,
    payload: {
      actionID: action.action_id,
      answer: step.answer,
      ...(step.kind === 'retry' ? { nextAttemptAt: context.clock.now() } : {}),
    },
    erasable: step.kind === 'done' ? { result: step.result } : {},
  };

  const attempt = { action, attempt: action.attempt_count };

  if (step.kind === 'retry') {
    return [checked];
  }

  if (step.kind === 'done') {
    return [
      checked,
      buildOutcomeRecord(context, attempt, {
        outcome: { status: 'done' },
        details: { result: step.result },
      }),
    ];
  }

  return [
    checked,
    buildOutcomeRecord(context, attempt, {
      outcome: { status: 'unknown', reason: 'ambiguous' },
      ownerReason: step.ownerReason,
    }),
  ];
}
