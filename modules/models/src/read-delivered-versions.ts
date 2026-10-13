import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import type { MemoryRef } from './types';

// Reads the item versions the thread's session still holds: those delivered in a step that ended
// its turn, since the last compaction, rebuild or invalidation. The memory context doc gives the
// rules for each record.
export async function readDeliveredVersions(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<readonly MemoryRef[]> {
  const state = { current: emptyState };

  for await (const record of readSessionRecords(context, taskID)) {
    state.current = buildSessionState(state.current, record);
  }
  return [...state.current.delivered.values()];
}

interface SessionState {
  readonly delivered: ReadonlyMap<string, MemoryRef>;

  // what the running step's recalls delivered, which its turn's end keeps
  readonly pending: ReadonlyMap<string, MemoryRef>;
  readonly isCompacted: boolean;
}

const emptyState: SessionState = { delivered: new Map(), pending: new Map(), isCompacted: false };

// A reset commits with its step's turn, after the step's recalls. A compaction summarized those
// recalls, so it drops them. A rebuild after a lost session drops them too, because the step's first
// recall served the lost session, and the turn's record lists what the rebuilt turn retrieved.
function buildSessionState(state: SessionState, record: LogRecord): SessionState {
  switch (record.kind) {
    case 'memory.recalled': {
      return { ...state, pending: mergeRefs(state.pending, parseRefs(record.payload['items'])) };
    }
    case 'model.turn_ended': {
      const retrieved = state.isCompacted ? [] : parseRefs(record.payload['retrieved']);

      return {
        ...state,
        delivered: mergeRefs(state.delivered, [...state.pending.values(), ...retrieved]),
        pending: new Map(),
      };
    }
    case 'task.step_started': {
      return { ...state, pending: new Map(), isCompacted: false };
    }
    case 'model.session_rebuilt': {
      return {
        ...state,
        delivered: new Map(),
        pending: record.payload['reason'] === 'invalidated' ? state.pending : new Map(),
      };
    }
    default: {
      return {
        delivered: new Map(),
        pending: new Map(),
        isCompacted: state.isCompacted || record.kind === 'model.compacted',
      };
    }
  }
}

function mergeRefs(
  refs: ReadonlyMap<string, MemoryRef>,
  added: readonly MemoryRef[],
): ReadonlyMap<string, MemoryRef> {
  return new Map([...refs, ...added.map((ref) => [`${ref.itemID}@${ref.version}`, ref] as const)]);
}

// the records that end what a session holds
const resetKinds = ['model.compacted', 'model.session_rebuilt', 'model.session_invalidated'];

const replayKinds = ['memory.recalled', 'model.turn_ended', 'task.step_started', ...resetKinds];

const pageSize = 200;

// The thread's records from the start of the step that wrote its newest reset, oldest first, so the
// replay sees every recall of the step a rebuild commits with.
async function* readSessionRecords(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): AsyncGenerator<LogRecord> {
  const page = { after: await readReplayStart(context, taskID), size: pageSize };

  while (page.size === pageSize) {
    // oxlint-disable-next-line no-await-in-loop -- each page reads on from the one before it
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

const refsSchema = z.array(z.object({ itemID: z.string(), version: z.int().positive() }));

// a record's list of item versions, or none for a list in another shape
function parseRefs(value: unknown): readonly MemoryRef[] {
  const parsed = refsSchema.safeParse(value);

  return parsed.success ? parsed.data : [];
}
