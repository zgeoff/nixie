import type { LogRecord, ReadRecordsOptions } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import type { MemoryRef } from './types';

export interface SessionMarks {
  // the pinned core the last turn ran with, or null before the first turn
  readonly previousCore: readonly MemoryRef[] | null;

  // whether a forget invalidated the session after the last turn read these marks
  readonly isInvalidated: boolean;

  // the newest session_invalidated record's sequence, or 0, which the turn_ended record keeps
  readonly invalidatedThrough: number;

  // whether the SDK compacted the session during the last turn, which can drop the opening's core
  readonly isCompacted: boolean;
}

// Reads the last turn's pinned core, and whether a forget invalidated the session after that turn
// read its marks, which blocks every resume. A turn that read its marks before an invalidation never
// validates the session, even when its step commits after it.
export async function readSessionMarks(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<SessionMarks> {
  const [invalidated, compacted, lastTurns] = await Promise.all([
    readNewest(context, { thread: taskID, kinds: ['model.session_invalidated'], limit: 1 }),
    readNewest(context, { thread: taskID, kinds: ['model.compacted'], limit: 1 }),
    readNewest(context, { thread: taskID, kinds: ['model.turn_ended'], limit: 2 }),
  ]);
  const [turn, turnBefore] = lastTurns;
  const invalidatedThrough = invalidated.at(0)?.sequence ?? 0;

  return {
    previousCore: turn === undefined ? null : parseCore(turn.payload['pinnedCore']),
    isInvalidated: invalidatedThrough > (turn === undefined ? 0 : parseTurnThrough(turn)),
    invalidatedThrough,

    // a step commits its compactions before its turn's end
    isCompacted: (compacted.at(0)?.sequence ?? 0) > (turnBefore?.sequence ?? 0),
  };
}

async function readNewest(
  context: Pick<TasksContext, 'log'>,
  query: Pick<ReadRecordsOptions, 'thread' | 'kinds' | 'limit'>,
): Promise<readonly LogRecord[]> {
  const entries = await readRecords(context.log, { ...query, afterSequence: 0, order: 'newest' });

  return entries.map((entry) => entry.record);
}

// a turn recorded before turns kept the marks they read saw every invalidation before it
function parseTurnThrough(turn: LogRecord): number {
  const parsed = z.int().nonnegative().safeParse(turn.payload['invalidatedThrough']);

  return parsed.success ? parsed.data : turn.sequence;
}

const coreSchema = z.array(z.object({ itemID: z.string(), version: z.int().positive() }));

// a turn recorded before the pinned core reached the prompt ran with no core
function parseCore(value: unknown): readonly MemoryRef[] {
  const parsed = coreSchema.safeParse(value);

  return parsed.success ? parsed.data : [];
}
