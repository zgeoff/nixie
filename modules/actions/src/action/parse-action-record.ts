import type { EnvelopeRecord, JSONValue } from '@heynixie/log';
import type {
  ActionRiskClass,
  ActionStatus,
  CheckAnswer,
  OutcomeReason,
  OwnerReason,
  UnknownChoice,
} from '../types';

export type ActionRecord =
  | {
      readonly kind: 'action.queued';
      readonly actionID: string;
      readonly taskID: string;
      readonly stepKey: string;
      readonly tool: string;
      readonly actionHash: string;
      readonly nextAttemptAt: number;
      readonly callSequence: number | null;
      readonly riskClass: ActionRiskClass;
      readonly deadlineAt: number | null;
      readonly isApproved: boolean;
      readonly runsInStep: boolean;
    }
  | { readonly kind: 'action.attempt_started'; readonly actionID: string; readonly attempt: number }
  | {
      readonly kind: 'action.retry_scheduled';
      readonly actionID: string;
      readonly nextAttemptAt: number;
      readonly reason: OutcomeReason;
    }
  | {
      readonly kind: 'action.reconcile_scheduled';
      readonly actionID: string;
      readonly step: 'retry' | 'check';
      readonly at: number;
    }
  | {
      readonly kind: 'action.reconcile_checked';
      readonly actionID: string;
      readonly answer: CheckAnswer;
      readonly nextAttemptAt: number | null;
    }
  | {
      readonly kind: 'action.held';
      readonly actionID: string;
      readonly proposalID: string;
    }
  | {
      readonly kind: 'action.released';
      readonly actionID: string;
      readonly riskClass: ActionRiskClass | null;
    }
  | {
      readonly kind: 'action.unknown_answered';
      readonly actionID: string;
      readonly choice: UnknownChoice;
      readonly nextAttemptAt: number | null;
    }
  | {
      readonly kind: 'action.outcome';
      readonly actionID: string;
      readonly status: Exclude<ActionStatus, 'pending'>;
      readonly reason: OutcomeReason | null;
      readonly ownerReason: OwnerReason | null;
    };

type GetField = (key: string) => JSONValue;

type Parser = (getField: GetField) => ActionRecord;

const actionRecordParsers: ReadonlyMap<string, Parser> = new Map<string, Parser>([
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
      callSequence: toOptionalNumber(getField('callSequence')),
      riskClass: toOptionalRiskClass(getField('riskClass')),
      deadlineAt: toOptionalNumber(getField('deadlineAt')),
      isApproved: getField('isApproved') === true,
      runsInStep: getField('runsInStep') === true,
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
    'action.reconcile_scheduled',
    (getField) => ({
      kind: 'action.reconcile_scheduled',
      actionID: toString(getField('actionID')),
      step: toEnum(getField('step'), ['retry', 'check']),
      at: toNumber(getField('at')),
    }),
  ],
  [
    'action.reconcile_checked',
    (getField) => ({
      kind: 'action.reconcile_checked',
      actionID: toString(getField('actionID')),
      answer: toEnum(getField('answer'), ['found', 'not_found', 'inconclusive']),
      nextAttemptAt: toOptionalNumber(getField('nextAttemptAt')),
    }),
  ],
  [
    'action.held',
    (getField) => ({
      kind: 'action.held',
      actionID: toString(getField('actionID')),
      proposalID: toString(getField('proposalID')),
    }),
  ],
  [
    'action.released',
    (getField) => ({
      kind: 'action.released',
      actionID: toString(getField('actionID')),
      riskClass: toOptionalRiskClass(getField('riskClass')),
    }),
  ],
  [
    'action.unknown_answered',
    (getField) => ({
      kind: 'action.unknown_answered',
      actionID: toString(getField('actionID')),
      choice: toEnum(getField('choice'), ['happened', 'retry', 'drop']),
      nextAttemptAt: toOptionalNumber(getField('nextAttemptAt')),
    }),
  ],
  [
    'action.outcome',
    (getField) => ({
      kind: 'action.outcome',
      actionID: toString(getField('actionID')),
      status: toSettledStatus(getField('status')),
      reason: getField('reason') === null ? null : toReason(getField('reason')),
      ownerReason: toOptionalOwnerReason(getField('ownerReason')),
    }),
  ],
]);

const optionalFields: ReadonlySet<string> = new Set([
  'callSequence',
  'riskClass',
  'deadlineAt',
  'isApproved',
  'runsInStep',
  'ownerReason',
  'nextAttemptAt',
]);

export function parseActionRecord(record: EnvelopeRecord): ActionRecord | null {
  const parse = actionRecordParsers.get(record.kind);

  if (parse === undefined) {
    return null;
  }

  return parse((key) => {
    const value = record.payload[key];

    // A field that came after the first release is optional, so a record from before it reads null.
    if (value === undefined) {
      if (optionalFields.has(key)) {
        return null;
      }

      throw new Error(`record ${record.sequence} of kind ${record.kind} lacks ${key}`);
    }

    return value;
  });
}

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

function toOptionalNumber(value: JSONValue): number | null {
  return value === null ? null : toNumber(value);
}

function toOptionalRiskClass(value: JSONValue): ActionRiskClass {
  return value === null ? 'routine' : toEnum(value, ['routine', 'always_ask', 'lifting']);
}

function toEnum<Member extends string>(
  value: JSONValue,
  members: readonly Member[],
  label = `one of ${members.join(', ')}`,
): Member {
  const text = toString(value);
  const known = members.find((candidate) => candidate === text);

  if (known === undefined) {
    throw new TypeError(`expected ${label}, got ${text}`);
  }

  return known;
}

function toReason(value: JSONValue): OutcomeReason {
  return toEnum(value, outcomeReasons, 'an outcome reason');
}

function toSettledStatus(value: JSONValue): Exclude<ActionStatus, 'pending'> {
  return toEnum(value, ['done', 'failed', 'unknown'], 'a settled action status');
}

function toOptionalOwnerReason(value: JSONValue): OwnerReason | null {
  return value === null ? null : toEnum(value, ownerReasons);
}

const ownerReasons: readonly OwnerReason[] = [
  'inconclusive',
  'unknown_streak',
  'no_reconcile',
  'key_expired',
  'not_found_ask',
];

const outcomeReasons: readonly OutcomeReason[] = [
  'refused',
  'refusal_can_clear',
  'retries_exhausted',
  'ambiguous',
  'attempt_without_result',
  'unknown_tool',
  'arguments_unreadable',
  'deadline_passed',
  'rule_denied',
  'declined',
  'lapsed',
  'destinations_changed',
  'dropped',
];
