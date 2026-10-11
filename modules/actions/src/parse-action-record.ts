import type { EnvelopeRecord, JSONValue } from '@heynixie/log';
import type { ActionStatus, OutcomeReason } from './types';

// The action records the actions projection folds, each with its plain payload.
export type ActionRecord =
  | {
      readonly kind: 'action.queued';
      readonly actionID: string;
      readonly taskID: string;
      readonly stepKey: string;
      readonly tool: string;
      readonly actionHash: string;
      readonly nextAttemptAt: number;
    }
  | { readonly kind: 'action.attempt_started'; readonly actionID: string; readonly attempt: number }
  | {
      readonly kind: 'action.retry_scheduled';
      readonly actionID: string;
      readonly nextAttemptAt: number;
      readonly reason: OutcomeReason;
    }
  | {
      readonly kind: 'action.outcome';
      readonly actionID: string;
      readonly status: Exclude<ActionStatus, 'pending'>;
      readonly reason: OutcomeReason | null;
    };

// Reads an action record's payload into its typed shape, or null for a record of another kind. An
// action record whose payload lacks a field throws, so a fold never writes a half-read row.
export function parseActionRecord(record: EnvelopeRecord): ActionRecord | null {
  const parse = actionRecordParsers.get(record.kind);

  if (parse === undefined) {
    return null;
  }
  return parse((key) => {
    const value = record.payload[key];

    if (value === undefined) {
      throw new Error(`record ${record.sequence} of kind ${record.kind} lacks ${key}`);
    }
    return value;
  });
}

type GetField = (key: string) => JSONValue;

const actionRecordParsers: ReadonlyMap<string, (getField: GetField) => ActionRecord> = new Map<
  string,
  (getField: GetField) => ActionRecord
>([
  [
    'action.queued',
    (getField) => ({
      kind: 'action.queued',
      actionID: toString(getField('actionID')),
      taskID: toString(getField('taskID')),
      stepKey: toString(getField('stepKey')),
      tool: toString(getField('tool')),
      actionHash: toString(getField('actionHash')),
      nextAttemptAt: toNumber(getField('nextAttemptAt')),
    }),
  ],
  [
    'action.attempt_started',
    (getField) => ({
      kind: 'action.attempt_started',
      actionID: toString(getField('actionID')),
      attempt: toNumber(getField('attempt')),
    }),
  ],
  [
    'action.retry_scheduled',
    (getField) => ({
      kind: 'action.retry_scheduled',
      actionID: toString(getField('actionID')),
      nextAttemptAt: toNumber(getField('nextAttemptAt')),
      reason: toReason(getField('reason')),
    }),
  ],
  [
    'action.outcome',
    (getField) => ({
      kind: 'action.outcome',
      actionID: toString(getField('actionID')),
      status: toSettledStatus(getField('status')),
      reason: getField('reason') === null ? null : toReason(getField('reason')),
    }),
  ],
]);

function toString(value: JSONValue): string {
  if (typeof value !== 'string') {
    throw new TypeError(`expected a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function toNumber(value: JSONValue): number {
  if (typeof value !== 'number') {
    throw new TypeError(`expected a number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function toSettledStatus(value: JSONValue): Exclude<ActionStatus, 'pending'> {
  const status = toString(value);
  const settled = settledStatuses.find((candidate) => candidate === status);

  if (settled === undefined) {
    throw new TypeError(`expected a settled action status, got ${status}`);
  }
  return settled;
}

const settledStatuses: readonly Exclude<ActionStatus, 'pending'>[] = ['done', 'failed', 'unknown'];

function toReason(value: JSONValue): OutcomeReason {
  const reason = toString(value);
  const known = outcomeReasons.find((candidate) => candidate === reason);

  if (known === undefined) {
    throw new TypeError(`expected an outcome reason, got ${reason}`);
  }
  return known;
}

const outcomeReasons: readonly OutcomeReason[] = [
  'refused',
  'refusal_can_clear',
  'retries_exhausted',
  'ambiguous',
  'attempt_without_result',
  'unknown_tool',
  'arguments_unreadable',
];
