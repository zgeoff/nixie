import type { LiveRecord } from './use-live-records';

export interface ToolActivity {
  readonly callID: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly input?: Readonly<Record<string, unknown>>;

  readonly outcome?: string;
  readonly tool: string;
}

export interface MemoryRating {
  readonly hasNote: boolean;
  readonly ratedBy?: string | undefined;
  readonly sequence: number;
  readonly verdict: 'helpful' | 'noise' | 'misleading';
}

export interface RecalledMemory {
  readonly itemID: string;
  readonly rating?: MemoryRating | undefined;
  readonly score?: number | undefined;
  readonly version: number;
}

export type ContextActivity = NonNullable<LiveRecord['context']>;

export type CompactionActivity = NonNullable<LiveRecord['compaction']> & {
  readonly sequence: number;
};

export type SummaryActivity = NonNullable<LiveRecord['summary']> & {
  readonly sequence: number;
};

type StepStatus = 'done' | 'failed' | 'interrupted' | 'running';

export interface StepActivity {
  readonly kind: 'step';
  readonly calls: readonly ToolActivity[];

  readonly compactions?: readonly CompactionActivity[];

  readonly context?: ContextActivity;

  readonly summaries?: readonly SummaryActivity[];

  readonly durationMs?: number;

  readonly error?: string;

  readonly key: number;

  readonly memories?: readonly RecalledMemory[];
  readonly records: readonly LiveRecord[];
  readonly status: StepStatus;
  readonly stepKey?: string;
  readonly taskID?: string;
}

export type ActivityItem =
  | { readonly kind: 'message'; readonly record: LiveRecord }
  | { readonly kind: 'reset'; readonly record: LiveRecord }
  | {
      readonly kind: 'moment';
      readonly record: LiveRecord;
      readonly moment: NonNullable<LiveRecord['moment']>;
    }
  | StepActivity;

type Ratings = Readonly<Record<string, MemoryRating>>;

interface ActivityState {
  readonly items: ActivityItem[];
  readonly ratings: Ratings;

  open: StepActivity | null;

  pending: LiveRecord[];
}

export function buildActivity(records: readonly LiveRecord[]): readonly ActivityItem[] {
  const state: ActivityState = {
    items: [],
    open: null,
    pending: [],
    ratings: collectRatings(records),
  };

  for (const record of records) {
    foldRecord(state, record);
  }

  return state.pending.length === 0
    ? state.items
    : [...state.items, buildStep(state.pending, 'done', state.ratings)];
}

function collectRatings(records: readonly LiveRecord[]): Ratings {
  return Object.fromEntries(
    records.flatMap((record) => {
      const rating = record.rating;

      if (rating === undefined) {
        return [];
      }

      return rating.items.map(
        (item) =>
          [
            buildRatingKey(rating.recalledSequence, item),
            {
              hasNote: item.hasNote,
              ...(rating.ratedBy === undefined ? {} : { ratedBy: rating.ratedBy }),
              sequence: record.sequence,
              verdict: item.verdict,
            },
          ] as const,
      );
    }),
  );
}

function buildRatingKey(
  recallSequence: number,
  item: Pick<RecalledMemory, 'itemID' | 'version'>,
): string {
  return `${recallSequence}:${item.itemID}@${item.version}`;
}

const messageKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

function foldRecord(state: ActivityState, record: LiveRecord): void {
  if (record.message !== undefined || messageKinds.has(record.kind)) {
    state.items.push({ kind: 'message', record });
  } else if (record.kind === 'log_reset') {
    state.items.push({ kind: 'reset', record });
  } else if (record.moment !== undefined) {
    state.items.push({ kind: 'moment', record, moment: record.moment });
  } else if (record.kind === 'task.step_started') {
    state.open = buildStep([...state.pending, record], 'running', state.ratings);
    state.pending = [];

    state.items.push(state.open);
  } else if (state.open === null) {
    foldRecordOutsideStep(state, record);
  } else {
    const index = state.items.indexOf(state.open);

    const step = buildStep(
      [...state.open.records, record],
      pickStatus(record, state.open),
      state.ratings,
    );

    state.items[index] = step;
    state.open = step.status === 'running' ? step : null;
  }
}

function buildStep(
  records: readonly LiveRecord[],
  status: StepStatus,
  ratings: Ratings,
): StepActivity {
  const task = records.find((record) => record.task !== undefined)?.task;
  const stepKey = records.find((record) => record.task?.stepKey !== undefined)?.task?.stepKey;
  const error = records.find((record) => record.task?.error !== undefined)?.task?.error;
  const durationMs = status === 'running' ? undefined : findDuration(records);
  const recalls = records.filter((record) => record.recall !== undefined);
  const context = records.findLast((record) => record.context !== undefined)?.context;

  const compactions = records.flatMap((record) =>
    record.compaction === undefined ? [] : [{ ...record.compaction, sequence: record.sequence }],
  );

  const summaries = records.flatMap((record) =>
    record.summary === undefined ? [] : [{ ...record.summary, sequence: record.sequence }],
  );

  return {
    calls: collectCalls(records),
    ...(compactions.length === 0 ? {} : { compactions }),
    ...(summaries.length === 0 ? {} : { summaries }),
    ...(context === undefined ? {} : { context }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(error === undefined ? {} : { error }),
    key: records[0]?.sequence ?? 0,
    kind: 'step',
    ...(recalls.length === 0
      ? {}
      : { memories: recalls.flatMap((record) => collectMemories(record, ratings)) }),
    records,
    status,
    ...(stepKey === undefined ? {} : { stepKey }),
    ...(task === undefined ? {} : { taskID: task.taskID }),
  };
}

const stepEnds: Readonly<Record<string, StepStatus>> = {
  'task.step_committed': 'done',
  'task.step_errored': 'failed',
  'task.step_interrupted': 'interrupted',
};

function findDuration(records: readonly LiveRecord[]): number | undefined {
  const started = records.find((record) => record.kind === 'task.step_started');
  const ended = records.findLast((record) => stepEnds[record.kind] !== undefined);

  return started === undefined || ended === undefined
    ? undefined
    : ended.recordedAt.getTime() - started.recordedAt.getTime();
}

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

function collectMemories(record: LiveRecord, ratings: Ratings): readonly RecalledMemory[] {
  return (record.recall?.items ?? []).map((item) => {
    const rating = ratings[buildRatingKey(record.sequence, item)];

    return rating === undefined
      ? item
      : { itemID: item.itemID, rating, score: item.score, version: item.version };
  });
}

function foldRecordOutsideStep(state: ActivityState, record: LiveRecord): void {
  const endStatus = stepEnds[record.kind];

  if (endStatus === undefined) {
    state.pending.push(record);
  } else {
    state.items.push(buildStep([...state.pending, record], endStatus, state.ratings));

    state.pending = [];
  }
}

function pickStatus(record: LiveRecord, step: StepActivity): StepStatus {
  return stepEnds[record.kind] ?? step.status;
}
