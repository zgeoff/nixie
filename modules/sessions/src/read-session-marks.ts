import type { ContextSize } from '@heynixie/compaction';
import type { LogRecord, ReadRecordsOptions } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import { sessionImageBudget } from './session-image-budget';
import type { ImageTally, MemoryRef } from './types';

export interface SessionMarks {
  // the pinned core the last turn ran with, or null before the first turn
  readonly previousCore: readonly MemoryRef[] | null;

  // whether a forget invalidated the session after the last turn read these marks
  readonly isInvalidated: boolean;

  // the newest session_invalidated record's sequence, or 0, which the turn_ended record keeps
  readonly invalidatedThrough: number;

  // Whether the newest session holds its opening record. A session from before opening records
  // lacks the pinned core, and so does one whose transcript an older guest's CLI compacted.
  readonly hasOpening: boolean;

  // the context the last turn ended with and its window, or null when it reported none
  readonly lastContext: ContextSize | null;

  // the persona hash the newest session opened under, or null for one opened before openings kept it
  readonly openedPersonaHash: string | null;

  // whether a summary committed after the last session opened, so the next one opens from it
  readonly isSummarized: boolean;

  // the compactions that failed in a row since the last summary or opening
  readonly compactionFailures: number;

  // the images the session held after the last turn, or none before any turn
  readonly images: ImageTally;
}

// Reads the last turn's pinned core, and whether a forget invalidated the session after that turn
// read its marks, which blocks every resume. A turn that read its marks before an invalidation never
// validates the session, even when its step commits after it.
export async function readSessionMarks(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<SessionMarks> {
  const [invalidated, lastTurns, opened, summarized, failed, cliCompacted] = await Promise.all([
    readNewest(context, { thread: taskID, kinds: ['model.session_invalidated'], limit: 1 }),
    readNewest(context, { thread: taskID, kinds: ['model.turn_ended'], limit: 1 }),
    readNewest(context, { thread: taskID, kinds: ['model.session_opened'], limit: 1 }),
    readNewest(context, { thread: taskID, kinds: ['model.session_summarized'], limit: 1 }),
    readNewest(context, { thread: taskID, kinds: ['model.compaction_failed'], limit: 1 }),

    // an older guest's CLI wrote these when it compacted a session's transcript
    readNewest(context, { thread: taskID, kinds: ['model.compacted'], limit: 1 }),
  ]);

  const [turn] = lastTurns;
  const invalidatedThrough = invalidated.at(0)?.sequence ?? 0;
  const openedThrough = opened.at(0)?.sequence ?? 0;
  const summarizedThrough = summarized.at(0)?.sequence ?? 0;

  return {
    previousCore: turn === undefined ? null : parseCore(turn.payload['pinnedCore']),
    isInvalidated: invalidatedThrough > (turn === undefined ? 0 : parseTurnThrough(turn)),
    invalidatedThrough,

    hasOpening: openedThrough > (cliCompacted.at(0)?.sequence ?? 0),
    openedPersonaHash: parsePersonaHash(opened.at(0)),
    lastContext: turn === undefined ? null : parseContext(turn),
    isSummarized: summarizedThrough > openedThrough,
    compactionFailures: countFailures(failed.at(0), Math.max(openedThrough, summarizedThrough)),
    images: turn === undefined ? { bytes: 0, count: 0 } : parseImages(turn),
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

// an opening recorded before openings kept their persona hash names none
function parsePersonaHash(opened: LogRecord | undefined): string | null {
  const parsed = z.string().safeParse(opened?.payload['personaHash']);

  return parsed.success ? parsed.data : null;
}

const coreSchema = z.array(z.object({ itemID: z.string(), version: z.int().positive() }));

// a turn recorded before the pinned core reached the prompt ran with no core
function parseCore(value: unknown): readonly MemoryRef[] {
  const parsed = coreSchema.safeParse(value);

  return parsed.success ? parsed.data : [];
}

const contextSchema = z.object({
  contextSize: z.int().nonnegative(),
  contextWindow: z.int().positive(),
});

// a turn whose model calls reported no usage, or one recorded before turns kept their context,
// gives none
function parseContext(turn: LogRecord): ContextSize | null {
  const parsed = contextSchema.safeParse(turn.payload);

  return parsed.success
    ? { size: parsed.data.contextSize, window: parsed.data.contextWindow }
    : null;
}

const tallySchema = z.int().nonnegative();

// a turn recorded before turns kept their session's images ran on a session with no images; one
// recorded before they kept the count reads as holding the most images a session takes, so a
// message with images rebuilds the session rather than risk the count
function parseImages(turn: LogRecord): ImageTally {
  const bytes = tallySchema.safeParse(turn.payload['sessionImageBytes']);

  if (!bytes.success) {
    return { bytes: 0, count: 0 };
  }

  const count = tallySchema.safeParse(turn.payload['sessionImageCount']);

  if (count.success) {
    return { bytes: bytes.data, count: count.data };
  }

  return { bytes: bytes.data, count: bytes.data > 0 ? sessionImageBudget.count : 0 };
}

const failuresSchema = z.object({ failures: z.int().positive() });

// the newest failure counts the failures in a row before it, unless a summary or a session opened
// after it
function countFailures(failed: LogRecord | undefined, resetThrough: number): number {
  if (failed === undefined || failed.sequence < resetThrough) {
    return 0;
  }

  const parsed = failuresSchema.safeParse(failed.payload);

  return parsed.success ? parsed.data.failures : 1;
}
