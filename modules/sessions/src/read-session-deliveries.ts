import type { LogRecord, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import {
  modelCompactedCodec,
  modelSessionOpenedCodec,
  modelSessionRebuiltCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
import { memoryRecalledCodec } from './memory-recalled-codec';
import type { MemoryRef } from './types';

// What retrieval and recall delivered to the thread's session that it still holds: the item
// versions, and the sequences of your past messages.
export interface SessionDeliveries {
  readonly versions: readonly MemoryRef[];
  readonly messages: readonly number[];
}

// Reads what the thread's session still holds of what was delivered in a step that ended its turn,
// since the session's opening record, the last compaction or an invalidation. The memory context
// doc gives the rules for each record.
export async function readSessionDeliveries(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<SessionDeliveries> {
  const state = { current: emptyState };

  for await (const record of readSessionRecords(context, taskID)) {
    state.current = buildSessionState(state.current, record);
  }

  return {
    versions: [...state.current.delivered.values()],
    messages: [...new Set(state.current.messages)],
  };
}

interface SessionState {
  readonly delivered: ReadonlyMap<string, MemoryRef>;

  // the past messages a turn's retrieval placed, by sequence; only a turn's end lists them
  readonly messages: readonly number[];

  // the running step's recalls, which its turn's end keeps up to its last result
  readonly pending: readonly PendingRecall[];
  readonly isCompacted: boolean;
}

interface PendingRecall {
  readonly sequence: number;
  readonly refs: readonly MemoryRef[];
}

const emptyState: SessionState = {
  delivered: new Map(),
  messages: [],
  pending: [],
  isCompacted: false,
};

// A reset commits after its step's recalls and drops them: a compaction summarized those through
// its mark, and a lost session's opening lists what its turn retrieved. A turn drops a recall after
// its last result, which reached a session that no turn resumes.
function buildSessionState(state: SessionState, record: LogRecord): SessionState {
  if (record.kind === 'memory.recalled') {
    const items = memoryRecalledCodec.tryDecodePartial(record.payload)?.items;
    const recall = { sequence: record.sequence, refs: toRefs(items) };

    return { ...state, pending: [...state.pending, recall] };
  }

  if (record.kind === 'model.turn_ended') {
    return buildTurnEnd(state, record);
  }

  if (record.kind === 'task.step_started') {
    return { ...state, pending: [], isCompacted: false };
  }

  return buildSessionReset(state, record);
}

// the turn keeps its step's recalls through its mark, and what it retrieved unless a compaction
// summarized it
function buildTurnEnd(state: SessionState, record: LogRecord): SessionState {
  const turn = modelTurnEndedCodec.tryDecodePartial(record.payload);
  const retrieved = state.isCompacted ? [] : toRefs(turn?.retrieved);
  const messages = state.isCompacted ? [] : (turn?.retrievedMessages ?? []);
  const through = turn?.recalledThrough ?? Number.MAX_SAFE_INTEGER;

  const recalled = state.pending
    .filter((recall) => recall.sequence <= through)
    .flatMap((recall) => recall.refs);

  return {
    ...state,
    delivered: mergeRefs(state.delivered, [...recalled, ...retrieved]),
    messages: [...state.messages, ...messages],
    pending: [],
  };
}

function mergeRefs(
  refs: ReadonlyMap<string, MemoryRef>,
  added: readonly MemoryRef[],
): ReadonlyMap<string, MemoryRef> {
  return new Map([...refs, ...added.map((ref) => [`${ref.itemID}@${ref.version}`, ref] as const)]);
}

// an opening or a rebuild ends what the session holds and keeps the recalls a lost session never
// saw, a compaction keeps the recalls after its mark, and an invalidation drops them all
function buildSessionReset(state: SessionState, record: LogRecord): SessionState {
  if (record.kind === 'model.session_opened' || record.kind === 'model.session_rebuilt') {
    return {
      ...state,
      delivered: new Map(),
      messages: [],
      pending: isLostSession(record)
        ? state.pending.filter((recall) => recall.sequence > parseLostRecallsThrough(record))
        : state.pending,
    };
  }

  // a compaction the CLI ran, which a log keeps from releases before the guest turned it off
  if (record.kind === 'model.compacted') {
    const compacted = modelCompactedCodec.tryDecodePartial(record.payload);
    const through = compacted?.recalledThrough ?? Number.MAX_SAFE_INTEGER;

    return {
      delivered: new Map(),
      messages: [],
      pending: state.pending.filter((recall) => recall.sequence > through),
      isCompacted: true,
    };
  }

  return { ...state, delivered: new Map(), messages: [], pending: [] };
}

// an opening in place of a session the guest lost, or a rebuild recorded before openings for one
function isLostSession(record: LogRecord): boolean {
  const reason = decodeOpening(record)?.reason;

  return reason === 'lost' || reason === 'missing';
}

// the recalls that served the lost session: through the opening's mark, or every one before a
// rebuild recorded without it
function parseLostRecallsThrough(record: LogRecord): number {
  return decodeOpening(record)?.recalledThrough ?? Number.MAX_SAFE_INTEGER;
}

interface Opening {
  readonly reason?: string | null | undefined;
  readonly recalledThrough?: number | undefined;
}

function decodeOpening(record: LogRecord): Opening | null {
  return record.kind === 'model.session_opened'
    ? modelSessionOpenedCodec.tryDecodePartial(record.payload)
    : modelSessionRebuiltCodec.tryDecodePartial(record.payload);
}

// the records that end what a session holds; session_rebuilt is the opening record that logs from
// before session_opened still hold
const resetKinds: readonly RecordKind[] = [
  'model.compacted',
  'model.session_opened',
  'model.session_rebuilt',
  'model.session_invalidated',
];

const replayKinds: readonly RecordKind[] = [
  'memory.recalled',
  'model.turn_ended',
  'task.step_started',
  ...resetKinds,
];

const pageSize = 200;

// The thread's records from the start of the step that wrote its newest reset, oldest first, so the
// replay sees every recall of the step a rebuild commits with.
async function* readSessionRecords(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): AsyncGenerator<LogRecord> {
  const page = { after: await readReplayStart(context, taskID), size: pageSize };

  while (page.size === pageSize) {
    const entries = await readRecords(context.log, {
      afterSequence: page.after,
      thread: taskID,
      kinds: replayKinds,
      limit: pageSize,
    });

    yield* entries.map((entry) => entry.record);
    page.size = entries.length;
    page.after = entries.at(-1)?.record.sequence ?? page.after;
  }
}

// the sequence just before the step that wrote the newest reset, or 0 for a thread with none
async function readReplayStart(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<number> {
  const [reset] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: resetKinds,
    order: 'newest',
    limit: 1,
  });

  if (reset === undefined) {
    return 0;
  }

  const [started] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence: reset.record.sequence,
    thread: taskID,
    kinds: ['task.step_started'],
    order: 'newest',
    limit: 1,
  });

  return started === undefined ? 0 : started.record.sequence - 1;
}

// A record's item versions, or none for a record from before it kept them. A turn or compaction
// recorded before it kept its recall mark took every recall of its step, and a turn recorded
// before retrieval placed past messages placed none.
function toRefs(refs: readonly MemoryRef[] | undefined): readonly MemoryRef[] {
  return (refs ?? []).map((ref) => ({ itemID: ref.itemID, version: ref.version }));
}
