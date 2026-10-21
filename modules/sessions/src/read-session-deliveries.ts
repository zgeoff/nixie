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

export interface SessionDeliveries {
  readonly versions: readonly MemoryRef[];
  readonly messages: readonly number[];
}

interface PendingRecall {
  readonly sequence: number;
  readonly refs: readonly MemoryRef[];
}

interface SessionState {
  readonly delivered: ReadonlyMap<string, MemoryRef>;

  readonly messages: readonly number[];

  readonly pending: readonly PendingRecall[];
  readonly isCompacted: boolean;
}

const emptyState: SessionState = {
  delivered: new Map(),
  messages: [],
  pending: [],
  isCompacted: false,
};

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

const pageSize = 200;

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

function toRefs(refs: readonly MemoryRef[] | undefined): readonly MemoryRef[] {
  return (refs ?? []).map((ref) => ({ itemID: ref.itemID, version: ref.version }));
}

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

function isLostSession(record: LogRecord): boolean {
  const reason = decodeOpening(record)?.reason;

  return reason === 'lost' || reason === 'missing';
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

function parseLostRecallsThrough(record: LogRecord): number {
  return decodeOpening(record)?.recalledThrough ?? Number.MAX_SAFE_INTEGER;
}
