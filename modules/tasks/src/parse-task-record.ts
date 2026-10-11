import type { EnvelopeRecord, JSONObject, JSONValue } from '@heynixie/log';
import type { TaskState } from './types';

// The task records the tasks and timers projections fold, each with its plain payload.
export type TaskRecord =
  | {
      readonly kind: 'task.created';
      readonly taskID: string;
      readonly isConversation: boolean;
      readonly state: TaskState;
    }
  | { readonly kind: 'task.step_started'; readonly taskID: string; readonly stepKey: string }
  | {
      readonly kind: 'task.step_committed';
      readonly taskID: string;
      readonly nextState: TaskState;
      readonly readCursor: number;
      readonly sessionBoundary: string | null;
      readonly timers: readonly { readonly timerID: string; readonly dueAt: number }[];
    }
  | { readonly kind: 'task.step_interrupted'; readonly taskID: string; readonly stepKey: string }
  | {
      readonly kind: 'task.step_errored';
      readonly taskID: string;
      readonly nextState: TaskState;
      readonly errors: number;
      readonly claimableAt: number;
    }
  | { readonly kind: 'task.lease_expired'; readonly taskID: string }
  | {
      readonly kind: 'timer.fired';
      readonly taskID: string;
      readonly timerID: string;
      readonly dueAt: number;
      readonly firedAt: number;
    };

// Reads a task record's payload into its typed shape, or null for a record of another kind. A task
// record whose payload lacks a field throws, so a fold never writes a half-read row.
export function parseTaskRecord(record: EnvelopeRecord): TaskRecord | null {
  const parse = taskRecordParsers.get(record.kind);

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

const taskRecordParsers: ReadonlyMap<string, (getField: GetField) => TaskRecord> = new Map<
  string,
  (getField: GetField) => TaskRecord
>([
  [
    'task.created',
    (getField) => ({
      kind: 'task.created',
      taskID: toString(getField('taskID')),
      isConversation: getField('isConversation') === true,
      state: toTaskState(getField('state')),
    }),
  ],
  [
    'task.step_started',
    (getField) => ({
      kind: 'task.step_started',
      taskID: toString(getField('taskID')),
      stepKey: toString(getField('stepKey')),
    }),
  ],
  [
    'task.step_committed',
    (getField) => ({
      kind: 'task.step_committed',
      taskID: toString(getField('taskID')),
      nextState: toTaskState(getField('nextState')),
      readCursor: toNumber(getField('readCursor')),
      sessionBoundary: toNullableString(getField('sessionBoundary')),
      timers: toTimers(getField('timers')),
    }),
  ],
  [
    'task.step_interrupted',
    (getField) => ({
      kind: 'task.step_interrupted',
      taskID: toString(getField('taskID')),
      stepKey: toString(getField('stepKey')),
    }),
  ],
  [
    'task.step_errored',
    (getField) => ({
      kind: 'task.step_errored',
      taskID: toString(getField('taskID')),
      nextState: toTaskState(getField('nextState')),
      errors: toNumber(getField('errors')),
      claimableAt: toNumber(getField('claimableAt')),
    }),
  ],
  [
    'task.lease_expired',
    (getField) => ({ kind: 'task.lease_expired', taskID: toString(getField('taskID')) }),
  ],
  [
    'timer.fired',
    (getField) => ({
      kind: 'timer.fired',
      taskID: toString(getField('taskID')),
      timerID: toString(getField('timerID')),
      dueAt: toNumber(getField('dueAt')),
      firedAt: toNumber(getField('firedAt')),
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

function toNullableString(value: JSONValue): string | null {
  return value === null ? null : toString(value);
}

function toTaskState(value: JSONValue): TaskState {
  const state = toString(value);

  if (!isTaskState(state)) {
    throw new TypeError(`expected a task state, got ${state}`);
  }
  return state;
}

function isTaskState(value: string): value is TaskState {
  return taskStates.some((state) => state === value);
}

const taskStates: readonly TaskState[] = ['ready', 'running', 'waiting', 'failed', 'done'];

function toTimers(
  value: JSONValue,
): readonly { readonly timerID: string; readonly dueAt: number }[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`expected a list of timers, got ${JSON.stringify(value)}`);
  }
  return value.map((timer: JSONValue) => {
    if (!isJSONObject(timer)) {
      throw new TypeError(`expected a timer, got ${JSON.stringify(timer)}`);
    }
    return { timerID: toString(timer['timerID'] ?? null), dueAt: toNumber(timer['dueAt'] ?? null) };
  });
}

function isJSONObject(value: JSONValue): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
