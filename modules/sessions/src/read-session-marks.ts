import type { ContextSize } from '@heynixie/compaction';
import type { LogRecord, ReadRecordsOptions } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import {
  modelCompactionFailedCodec,
  modelSessionOpenedCodec,
  modelTurnEndedCodec,
} from '@heynixie/models';
import type { TasksContext } from '@heynixie/tasks';
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

  // the newest session's key, or null before the first opening
  readonly sessionKey: string | null;

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
  const ended = turn === undefined ? null : modelTurnEndedCodec.tryDecodePartial(turn.payload);
  const invalidatedThrough = invalidated.at(0)?.sequence ?? 0;
  const openedThrough = opened.at(0)?.sequence ?? 0;
  const summarizedThrough = summarized.at(0)?.sequence ?? 0;

  return {
    // a turn recorded before the pinned core reached the prompt ran with no core
    previousCore: turn === undefined ? null : (ended?.pinnedCore ?? []),
    isInvalidated: invalidatedThrough > (turn === undefined ? 0 : getTurnThrough(turn, ended)),
    invalidatedThrough,

    hasOpening: openedThrough > (cliCompacted.at(0)?.sequence ?? 0),
    openedPersonaHash: findPersonaHash(opened.at(0)),
    sessionKey: findSessionKey(opened.at(0)),
    lastContext: toContext(ended),
    isSummarized: summarizedThrough > openedThrough,
    compactionFailures: countFailures(failed.at(0), Math.max(openedThrough, summarizedThrough)),
    images: toImages(ended),
  };
}

async function readNewest(
  context: Pick<TasksContext, 'log'>,
  query: Pick<ReadRecordsOptions, 'thread' | 'kinds' | 'limit'>,
): Promise<readonly LogRecord[]> {
  const entries = await readRecords(context.log, { ...query, afterSequence: 0, order: 'newest' });

  return entries.map((entry) => entry.record);
}

type TurnEnd = ReturnType<typeof modelTurnEndedCodec.tryDecodePartial>;

// a turn recorded before turns kept the marks they read saw every invalidation before it
function getTurnThrough(turn: LogRecord, ended: TurnEnd): number {
  return ended?.invalidatedThrough ?? turn.sequence;
}

// an opening recorded before openings kept their persona hash names none
function findPersonaHash(opened: LogRecord | undefined): string | null {
  const payload =
    opened === undefined ? null : modelSessionOpenedCodec.tryDecodePartial(opened.payload);

  return payload?.personaHash ?? null;
}

// an opening recorded before openings kept their key is keyed by its own sequence, which no later
// opening shares
function findSessionKey(opened: LogRecord | undefined): string | null {
  if (opened === undefined) {
    return null;
  }

  const payload = modelSessionOpenedCodec.tryDecodePartial(opened.payload);

  return payload?.sessionKey ?? `opening-${opened.sequence}`;
}

// a turn whose model calls reported no usage, or one recorded before turns kept their context,
// gives none
function toContext(ended: TurnEnd): ContextSize | null {
  return ended?.contextSize === undefined || ended.contextWindow === undefined
    ? null
    : { size: ended.contextSize, window: ended.contextWindow };
}

// the newest failure counts the failures in a row before it, unless a summary or a session opened
// after it
function countFailures(failed: LogRecord | undefined, resetThrough: number): number {
  if (failed === undefined || failed.sequence < resetThrough) {
    return 0;
  }

  return modelCompactionFailedCodec.tryDecodePartial(failed.payload)?.failures ?? 1;
}

// a turn recorded before turns kept their session's images ran on a session with no images; one
// recorded before they kept the count reads as holding the most images a session takes, so a
// message with images rebuilds the session rather than risk the count
function toImages(ended: TurnEnd): ImageTally {
  const bytes = ended?.sessionImageBytes;

  if (bytes === undefined) {
    return { bytes: 0, count: 0 };
  }

  return { bytes, count: ended?.sessionImageCount ?? (bytes > 0 ? sessionImageBudget.count : 0) };
}
