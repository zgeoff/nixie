import { collectSentFiles } from './collect-sent-files';
import { collectSentMessages } from './collect-sent-messages';
import { collectWorkers } from './collect-workers';
import { formatFailureCause } from './format-failure-cause';
import type { LiveRecord } from './use-live-records';
import type { WorkerActivity } from './worker-activity';

export interface RecordRef {
  readonly sequence: number;
  readonly thread: string;
}

export interface ToolActivity {
  // the record that holds the call, which the server cut when its input is cut
  readonly called?: RecordRef;
  readonly callID: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly input?: Readonly<Record<string, unknown>>;

  // the call's record or its result's record was removed, so the call keeps no input or content
  readonly isRemoved?: true;

  // the call's result holds a string that the server cut
  readonly isContentCut?: true;

  // the call's input holds a string that the server cut
  readonly isInputCut?: true;

  readonly outcome?: string;

  // the run that made the call; a worker's own call carries the worker run's ID
  readonly runID?: string;

  // the record that holds the call's result, which a forget removes
  readonly result?: { readonly kind: string; readonly sequence: number; readonly thread: string };

  readonly tool: string;
}

export interface RecalledMemory {
  readonly itemID: string;
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

export interface TaskMessageActivity {
  // the record that holds the call that sent the message, when the server cut the text
  readonly cut?: RecordRef;
  readonly direction: 'received' | 'sent';
  readonly hop: number;
  readonly kind: string;
  readonly messageID: string;
  readonly taskID: string;

  readonly taskName?: string;
  readonly text?: string;

  readonly woke: boolean;
}

export interface SentFileActivity {
  readonly callID: string;
  readonly file: string;
  readonly name: string;
  readonly bytes: number;
  readonly mediaType: string;
  readonly caption?: string;
}

type StepStatus = 'done' | 'failed' | 'interrupted' | 'running';

export interface StepActivity {
  readonly kind: 'step';
  readonly calls: readonly ToolActivity[];

  readonly compactions?: readonly CompactionActivity[];

  readonly context?: ContextActivity;

  readonly summaries?: readonly SummaryActivity[];

  readonly durationMs?: number;

  // the plain-words cause of a failed step whose reason the client knows
  readonly cause?: string;

  readonly error?: string;

  readonly isSilent?: true;

  readonly key: number;

  readonly memories?: readonly RecalledMemory[];
  readonly records: readonly LiveRecord[];

  readonly sentFiles?: readonly SentFileActivity[];
  readonly sentMessages?: readonly TaskMessageActivity[];

  readonly status: StepStatus;
  readonly stepKey?: string;
  readonly taskID?: string;

  readonly workers?: readonly WorkerActivity[];
}

export type ActivityItem =
  | { readonly kind: 'message'; readonly record: LiveRecord }
  | { readonly kind: 'reset'; readonly record: LiveRecord }
  | {
      readonly kind: 'moment';
      readonly record: LiveRecord;
      readonly moment: NonNullable<LiveRecord['moment']>;
    }
  | {
      readonly kind: 'taskMessage';
      readonly record: LiveRecord;
      readonly message: TaskMessageActivity;
    }
  | {
      readonly kind: 'exchange';
      readonly record: LiveRecord;
      readonly notice: NonNullable<LiveRecord['exchangeNotice']>;
    }
  | {
      readonly kind: 'definition';
      readonly record: LiveRecord;
      readonly notice: NonNullable<LiveRecord['definitionNotice']>;
    }
  | {
      readonly kind: 'skill';
      readonly record: LiveRecord;
      readonly notice: NonNullable<LiveRecord['skillNotice']>;
    }
  | {
      readonly kind: 'reminder';
      readonly record: LiveRecord;
      readonly reminder: NonNullable<LiveRecord['reminder']>;
    }
  | {
      readonly kind: 'proposal';
      readonly record: LiveRecord;
      readonly proposal: NonNullable<LiveRecord['proposal']>;
    }
  | {
      readonly kind: 'stop';
      readonly record: LiveRecord;
      readonly stop: NonNullable<LiveRecord['stop']>;
    }
  | StepActivity;

interface ActivityState {
  readonly items: ActivityItem[];

  open: StepActivity | null;

  pending: LiveRecord[];
}

export function buildActivity(records: readonly LiveRecord[]): readonly ActivityItem[] {
  const state: ActivityState = {
    items: [],
    open: null,
    pending: [],
  };

  for (const record of records) {
    foldRecord(state, record);
  }

  const items =
    state.pending.length === 0 ? state.items : [...state.items, buildStep(state.pending, 'done')];

  return supersedeDefinitionNotices(items);
}

const messageKinds: ReadonlySet<string> = new Set(['owner_message', 'model.reply']);

function foldRecord(state: ActivityState, record: LiveRecord): void {
  if (record.message !== undefined || messageKinds.has(record.kind)) {
    state.items.push({ kind: 'message', record });
  } else if (record.proposal !== undefined) {
    state.items.push({ kind: 'proposal', record, proposal: record.proposal });
  } else if (record.kind === 'log_reset') {
    state.items.push({ kind: 'reset', record });
  } else if (record.moment !== undefined) {
    state.items.push({ kind: 'moment', record, moment: record.moment });
  } else if (record.taskMessage !== undefined) {
    state.items.push({
      kind: 'taskMessage',
      record,
      message: toReceivedMessage(record.taskMessage),
    });
  } else if (record.exchangeNotice !== undefined) {
    state.items.push({ kind: 'exchange', record, notice: record.exchangeNotice });
  } else if (record.definitionNotice !== undefined) {
    state.items.push({ kind: 'definition', record, notice: record.definitionNotice });
  } else if (record.skillNotice !== undefined) {
    state.items.push({ kind: 'skill', record, notice: record.skillNotice });
  } else if (record.reminder !== undefined) {
    state.items.push({ kind: 'reminder', record, reminder: record.reminder });
  } else if (record.stop !== undefined) {
    state.items.push({ kind: 'stop', record, stop: record.stop });
  } else if (record.kind === 'task.step_started') {
    state.open = buildStep([...state.pending, record], 'running');
    state.pending = [];

    state.items.push(state.open);
  } else if (state.open === null) {
    foldRecordOutsideStep(state, record);
  } else {
    const index = state.items.indexOf(state.open);
    const step = buildStep([...state.open.records, record], pickStatus(record, state.open));

    state.items[index] = step;
    state.open = step.status === 'running' ? step : null;
  }
}

function toReceivedMessage(message: NonNullable<LiveRecord['taskMessage']>): TaskMessageActivity {
  return {
    direction: 'received',
    hop: message.hop,
    kind: message.kind,
    messageID: message.messageID,
    taskID: message.from,
    taskName: message.fromName,
    ...(message.text === undefined ? {} : { text: message.text }),
    woke: message.woke,
  };
}

function buildStep(records: readonly LiveRecord[], status: StepStatus): StepActivity {
  const task = records.find((record) => record.task !== undefined)?.task;
  const stepKey = records.find((record) => record.task?.stepKey !== undefined)?.task?.stepKey;
  const error = records.find((record) => record.task?.error !== undefined)?.task?.error;
  const reason = records.find((record) => record.task?.reason !== undefined)?.task?.reason;
  const cause = formatFailureCause(reason) ?? undefined;
  const durationMs = status === 'running' ? undefined : findDuration(records);
  const recalls = records.filter((record) => record.recall !== undefined);
  const context = records.findLast((record) => record.context !== undefined)?.context;

  const compactions = records.flatMap((record) =>
    record.compaction === undefined ? [] : [{ ...record.compaction, sequence: record.sequence }],
  );

  const summaries = records.flatMap((record) =>
    record.summary === undefined ? [] : [{ ...record.summary, sequence: record.sequence }],
  );

  const allCalls = collectCalls(records);
  const workers = collectWorkers(records, allCalls);

  const workerRunIDs = new Set(workers.map((worker) => worker.workerRunID));

  const calls = allCalls.filter(
    (call) => call.runID === undefined || !workerRunIDs.has(call.runID),
  );

  const sentMessages = collectSentMessages(calls);
  const sentFiles = collectSentFiles(calls);

  return {
    calls,
    ...(compactions.length === 0 ? {} : { compactions }),
    ...(summaries.length === 0 ? {} : { summaries }),
    ...(context === undefined ? {} : { context }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(cause === undefined ? {} : { cause }),
    ...(error === undefined ? {} : { error }),
    ...(records.some((record) => record.isSilentTurn === true) ? { isSilent: true } : {}),
    key: records[0]?.sequence ?? 0,
    kind: 'step',
    ...(recalls.length === 0
      ? {}
      : { memories: recalls.flatMap((record) => record.recall?.items ?? []) }),
    records,
    ...(sentFiles.length === 0 ? {} : { sentFiles }),
    ...(sentMessages.length === 0 ? {} : { sentMessages }),
    status,
    ...(stepKey === undefined ? {} : { stepKey }),
    ...(task === undefined ? {} : { taskID: task.taskID }),
    ...(workers.length === 0 ? {} : { workers }),
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
      const clips = record.isRemoved === true ? [] : (record.clipped ?? []);
      const isInputCut = clips.some((clip) => clip.field === 'toolCall.input');
      const isContentCut = clips.some((clip) => clip.field === 'toolCall.content');

      calls.set(toolCall.callID, {
        ...earlier,
        callID: toolCall.callID,
        ...(record.isRemoved === true ? { isRemoved: true } : {}),
        ...(toolCall.runID === undefined ? {} : { runID: toolCall.runID }),
        ...(isInputCut
          ? { called: { sequence: record.sequence, thread: record.thread }, isInputCut: true }
          : {}),
        ...(isContentCut ? { isContentCut: true } : {}),
        tool: toolCall.tool ?? earlier?.tool ?? 'tool',
        ...(toolCall.input === undefined ? {} : { input: toolCall.input }),
        ...(toolCall.outcome === undefined ? {} : { outcome: toolCall.outcome }),
        ...(toolCall.content === undefined ? {} : { content: toolCall.content }),
        ...(record.kind === 'tool_result'
          ? { result: { kind: record.kind, sequence: record.sequence, thread: record.thread } }
          : {}),
      });
    }
  }

  return [...calls.values()];
}

function foldRecordOutsideStep(state: ActivityState, record: LiveRecord): void {
  const endStatus = stepEnds[record.kind];

  if (endStatus === undefined) {
    state.pending.push(record);
  } else {
    state.items.push(buildStep([...state.pending, record], endStatus));

    state.pending = [];
  }
}

function pickStatus(record: LiveRecord, step: StepActivity): StepStatus {
  return stepEnds[record.kind] ?? step.status;
}

// A notice is read when its record is read, so a later change of the same definition leaves it
// showing a state that no longer holds. Each notice that a later one follows reads as superseded.
function supersedeDefinitionNotices(items: readonly ActivityItem[]): readonly ActivityItem[] {
  const seen = new Set<string>();

  const result: ActivityItem[] = [];

  for (const item of items.toReversed()) {
    if (item.kind !== 'definition') {
      result.push(item);
      continue;
    }

    const notice = item.notice;
    const isLater = seen.has(notice.definitionID);
    const isLive = notice.state === 'in_force' || notice.state === 'adopted';

    seen.add(notice.definitionID);

    const shown: ActivityItem =
      isLater && isLive
        ? { kind: 'definition', record: item.record, notice: buildSupersededNotice(notice) }
        : item;

    result.push(shown);
  }

  return result.toReversed();
}

function buildSupersededNotice(
  notice: NonNullable<LiveRecord['definitionNotice']>,
): NonNullable<LiveRecord['definitionNotice']> {
  return { ...notice, state: 'superseded' as const, next: null };
}
