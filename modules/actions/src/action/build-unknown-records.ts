import type { ActionConnector } from '@heynixie/connectors';
import type { JSONObject, RecordInput } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { ActionRow, OutcomeReason } from '../types';
import { defaultRetryDelaysMs } from './default-retry-delays-ms';
import { pickReconcileStep } from './pick-reconcile-step';

export interface UnknownFacts {
  readonly action: Pick<
    ActionRow,
    | 'action_id'
    | 'task_id'
    | 'tool'
    | 'unknown_streak'
    | 'first_attempt_at'
    | 'last_attempt_at'
    | 'attempt_count'
  >;
  readonly attempt: number;
  readonly reason: OutcomeReason;
  readonly details: JSONObject;

  // undefined when the action's tool has no connector
  readonly connector: Pick<ActionConnector, 'reconcile' | 'retryDelaysMs'> | undefined;
  readonly now: number;
}

// The records that settle an unknown outcome: a retry or a check scheduled, or the owner's question.
export function buildUnknownRecords(
  context: Pick<TasksContext, 'definitions'>,
  facts: UnknownFacts,
): RecordInput[] {
  const retryDelaysMs = facts.connector?.retryDelaysMs ?? defaultRetryDelaysMs;

  const step = pickReconcileStep({
    reconcile: facts.connector?.reconcile ?? { kind: 'none' },
    streak: facts.action.unknown_streak + 1,
    firstAttemptAt: facts.action.first_attempt_at,
    lastAttemptAt: facts.action.last_attempt_at,
    now: facts.now,
    hasRetryLeft: retryDelaysMs[facts.attempt - 1] !== undefined,
  });

  if (step.kind === 'owner') {
    return [
      {
        kind: 'action.outcome',
        definitions: context.definitions(),
        thread: facts.action.task_id,
        payload: {
          actionID: facts.action.action_id,
          tool: facts.action.tool,
          status: 'unknown',
          attempt: facts.attempt,
          reason: facts.reason,
          ownerReason: step.ownerReason,
        },
        erasable: facts.details,
      },
    ];
  }

  return [
    {
      kind: 'action.reconcile_scheduled',
      definitions: context.definitions(),
      thread: facts.action.task_id,
      payload: {
        actionID: facts.action.action_id,
        attempt: facts.attempt,
        step: step.kind,
        at: step.at,
        reason: facts.reason,
      },
    },
  ];
}
