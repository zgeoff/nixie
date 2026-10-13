import type { LiveRecord } from './use-live-records';

// One call a step made, joined from the call's record and its result's record.
export interface ToolActivity {
  readonly callID: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly input?: Readonly<Record<string, unknown>>;

  // absent until the result arrives
  readonly outcome?: string;
  readonly tool: string;
}

type StepStatus = 'done' | 'failed' | 'interrupted' | 'running';

export interface StepActivity {
  readonly kind: 'step';
  readonly calls: readonly ToolActivity[];

  // the error a failed step threw, while its record is readable
  readonly error?: string;

  // the sequence of the group's first record, which keys it in the list
  readonly key: number;
  readonly records: readonly LiveRecord[];
  readonly status: StepStatus;
  readonly stepKey?: string;
  readonly taskID?: string;
}

export type ActivityItem = { readonly kind: 'message'; readonly record: LiveRecord } | StepActivity;

// Groups a thread's records for the view: each message stands alone, and every other record
// folds into the step it belongs to. A record before a step, such as the task's creation, folds
// into the step that follows it; one after the last step forms a group of its own.
export function buildActivity(records: readonly LiveRecord[]): readonly ActivityItem[] {
  const state: ActivityState = { items: [], open: null, pending: [] };

  for (const record of records) {
    applyRecord(state, record);
  }

  return state.pending.length === 0
    ? state.items
    : [...state.items, buildStep(state.pending, 'done')];
}

interface ActivityState {
  readonly items: ActivityItem[];

  // the step whose end has not arrived yet
  open: StepActivity | null;

  // records before the next step starts
  pending: LiveRecord[];
}

// Adds one record to the groups: a message stands alone, and any other record joins the open step.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the fold updates its own state
function applyRecord(state: ActivityState, record: LiveRecord): void {
  if (record.message !== undefined) {
    state.items.push({ kind: 'message', record });
  } else if (record.kind === 'task.step_started') {
    state.open = buildStep([...state.pending, record], 'running');
    state.pending = [];
    state.items.push(state.open);
  } else if (state.open === null) {
    state.pending.push(record);
  } else {
    const index = state.items.indexOf(state.open);
    const step = buildStep([...state.open.records, record], pickStatus(record, state.open));

    state.items[index] = step;
    state.open = step.status === 'running' ? step : null;
  }
}

const stepEnds: Readonly<Record<string, StepStatus>> = {
  'task.step_committed': 'done',
  'task.step_errored': 'failed',
  'task.step_interrupted': 'interrupted',
};

function pickStatus(record: LiveRecord, step: StepActivity): StepStatus {
  return stepEnds[record.kind] ?? step.status;
}

function buildStep(records: readonly LiveRecord[], status: StepStatus): StepActivity {
  const task = records.find((record) => record.task !== undefined)?.task;
  const stepKey = records.find((record) => record.task?.stepKey !== undefined)?.task?.stepKey;
  const error = records.find((record) => record.task?.error !== undefined)?.task?.error;

  return {
    calls: collectCalls(records),
    ...(error === undefined ? {} : { error }),
    key: records[0]?.sequence ?? 0,
    kind: 'step',
    records,
    status,
    ...(stepKey === undefined ? {} : { stepKey }),
    ...(task === undefined ? {} : { taskID: task.taskID }),
  };
}

// Joins each call to its result by the call ID, in the order the calls started.
function collectCalls(records: readonly LiveRecord[]): readonly ToolActivity[] {
  const calls = new Map<string, ToolActivity>();

  for (const record of records) {
    const toolCall = record.toolCall;

    if (toolCall !== undefined) {
      const earlier = calls.get(toolCall.callID);

      calls.set(toolCall.callID, {
        ...earlier,
        callID: toolCall.callID,
        tool: toolCall.tool ?? earlier?.tool ?? 'tool',
        ...(toolCall.input === undefined ? {} : { input: toolCall.input }),
        ...(toolCall.outcome === undefined ? {} : { outcome: toolCall.outcome }),
        ...(toolCall.content === undefined ? {} : { content: toolCall.content }),
      });
    }
  }

  return [...calls.values()];
}
