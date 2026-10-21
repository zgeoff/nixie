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
  readonly previousCore: readonly MemoryRef[] | null;

  readonly isInvalidated: boolean;

  readonly invalidatedThrough: number;

  readonly hasOpening: boolean;

  readonly lastContext: ContextSize | null;

  readonly openedPersonaHash: string | null;

  // the newest session's key, or null before the first opening
  readonly sessionKey: string | null;

  readonly isSummarized: boolean;

  readonly compactionFailures: number;

  readonly images: ImageTally;
}

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

    // A log can hold this kind from a guest whose CLI compacted the transcript itself.
    readNewest(context, { thread: taskID, kinds: ['model.compacted'], limit: 1 }),
  ]);

  const [turn] = lastTurns;
  const ended = turn === undefined ? null : modelTurnEndedCodec.tryDecodePartial(turn.payload);
  const invalidatedThrough = invalidated.at(0)?.sequence ?? 0;
  const openedThrough = opened.at(0)?.sequence ?? 0;
  const summarizedThrough = summarized.at(0)?.sequence ?? 0;

  return {
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

function getTurnThrough(turn: LogRecord, ended: TurnEnd): number {
  return ended?.invalidatedThrough ?? turn.sequence;
}

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

function toContext(ended: TurnEnd): ContextSize | null {
  return ended?.contextSize === undefined || ended.contextWindow === undefined
    ? null
    : { size: ended.contextSize, window: ended.contextWindow };
}

function countFailures(failed: LogRecord | undefined, resetThrough: number): number {
  if (failed === undefined || failed.sequence < resetThrough) {
    return 0;
  }

  return modelCompactionFailedCodec.tryDecodePartial(failed.payload)?.failures ?? 1;
}

// A turn record from an earlier release can lack the image count. It reads as a full session, so a
// message with images rebuilds the session rather than trust an unknown count.
function toImages(ended: TurnEnd): ImageTally {
  const bytes = ended?.sessionImageBytes;

  if (bytes === undefined) {
    return { bytes: 0, count: 0 };
  }

  return { bytes, count: ended?.sessionImageCount ?? (bytes > 0 ? sessionImageBudget.count : 0) };
}
