import { buildStep, stepEnds } from './build-step';
import type { StepStatus } from './build-step';
import { splitSteps } from './split-steps';
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

  // the call's result grew old, so its content is gone
  readonly isExpired?: true;

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

export interface PlaceActActivity {
  readonly place: string;
  readonly tools: readonly { readonly tool: string; readonly count: number }[];
}

export interface PlaceNarrowingActivity {
  readonly place: string;
  readonly trust?: string;
  readonly isRemoved: boolean;
}

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

  // a later segment of a step that a message split; the first segment holds the step's header
  readonly isContinued?: true;

  readonly isSilent?: true;

  readonly key: number;

  // the places that calls of the step acted at, which an act place allowed
  readonly placeActs?: readonly PlaceActActivity[];

  // the places that a places.narrow call of the step lowered or removed
  readonly placeNarrowings?: readonly PlaceNarrowingActivity[];

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
  | {
      readonly kind: 'message';
      readonly record: LiveRecord;

      // the plain-words cause of the failed step that a voided reply sits in
      readonly cause?: string;
    }
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

  return supersedeDefinitionNotices(splitSteps(items));
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
