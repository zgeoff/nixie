import type { LogRecord } from '@heynixie/log';
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
}

// Reads the last turn's pinned core, and whether a forget invalidated the session after that turn
// read its marks, which blocks every resume. A turn that read its marks before an invalidation never
// validates the session, even when its step commits after it.
export async function readSessionMarks(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<SessionMarks> {
  const [invalidated, lastTurn] = await Promise.all([
    readRecords(context.log, {
      afterSequence: 0,
      thread: taskID,
      kinds: ['model.session_invalidated'],
      order: 'newest',
      limit: 1,
    }),
    readRecords(context.log, {
      afterSequence: 0,
      thread: taskID,
      kinds: ['model.turn_ended'],
      order: 'newest',
      limit: 1,
    }),
  ]);
  const turn = lastTurn.at(0)?.record;
  const invalidatedThrough = invalidated.at(0)?.record.sequence ?? 0;

  return {
    previousCore: turn === undefined ? null : parseCore(turn.payload['pinnedCore']),
    isInvalidated: invalidatedThrough > (turn === undefined ? 0 : parseTurnThrough(turn)),
    invalidatedThrough,
  };
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
