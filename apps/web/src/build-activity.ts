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

// A memory version a recall in the step delivered, with its match score when a query ranked it.
export interface RecalledMemory {
  readonly itemID: string;
  readonly score?: number | undefined;
  readonly version: number;
}

// The context the step's last model call read, in tokens, and the window its session compacts
// within.
export type ContextActivity = NonNullable<LiveRecord['context']>;

// A compaction of the session during the step, with its tokens before and after, and the sequence
// of its record, which keys it in a list.
export type CompactionActivity = NonNullable<LiveRecord['compaction']> & {
  readonly sequence: number;
};

type StepStatus = 'done' | 'failed' | 'interrupted' | 'running';

export interface StepActivity {
  readonly kind: 'step';
  readonly calls: readonly ToolActivity[];

  // each compaction in the step, in order; absent when the session did not compact
  readonly compactions?: readonly CompactionActivity[];

  // the context of the step's last turn end that recorded one
  readonly context?: ContextActivity;

  // how long the step ran, from its start to its end, once it has ended
  readonly durationMs?: number;

  // the error a failed step threw, while its record is readable
  readonly error?: string;

  // the sequence of the group's first record, which keys it in the list
  readonly key: number;

  // what the step's recalls delivered, in order; absent when the step recalled nothing
  readonly memories?: readonly RecalledMemory[];
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
  const durationMs = status === 'running' ? undefined : findDuration(records);
  const recalls = records.filter((record) => record.recall !== undefined);
  const context = records.findLast((record) => record.context !== undefined)?.context;
  const compactions = records.flatMap((record) =>
    record.compaction === undefined ? [] : [{ ...record.compaction, sequence: record.sequence }],
  );

  return {
    calls: collectCalls(records),
    ...(compactions.length === 0 ? {} : { compactions }),
    ...(context === undefined ? {} : { context }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(error === undefined ? {} : { error }),
    key: records[0]?.sequence ?? 0,
    kind: 'step',
    ...(recalls.length === 0
      ? {}
      : { memories: recalls.flatMap((record) => record.recall?.items ?? []) }),
    records,
    status,
    ...(stepKey === undefined ? {} : { stepKey }),
    ...(task === undefined ? {} : { taskID: task.taskID }),
  };
}

// the time from the step's start record to its end record
function findDuration(records: readonly LiveRecord[]): number | undefined {
  const started = records.find((record) => record.kind === 'task.step_started');
  const ended = records.findLast((record) => stepEnds[record.kind] !== undefined);

  return started === undefined || ended === undefined
    ? undefined
    : ended.recordedAt.getTime() - started.recordedAt.getTime();
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
