import type { CompactionSettings, ContextSize } from '@heynixie/compaction';
import { findCompactionHeadsUp, isCompactionDue } from '@heynixie/compaction';
import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { modelTurnEndedCodec } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import type { EventKind, NotedEvent } from './types';

// A conversation turn that ended past the heads-up and under the threshold: the tokens left before
// the next turn's end compacts the session, and the threshold's share of the window.
export interface CompactionHeadsUp {
  readonly tokensLeft: number;
  readonly threshold: number;
}

// The event kind that warns the model that compaction is near, from the first turn of a session to
// end past the heads-up, so the warning comes again only after a new session opens, as one does
// after each compaction.
export function buildCompactionHeadsUpKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  settings: Pick<CompactionSettings, 'threshold' | 'headsUp'>,
): EventKind<CompactionHeadsUp> {
  return {
    name: 'compaction_heads_up',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        thread: conversationTaskID,
        kinds: ['model.turn_ended'],
        limit: readLimit,
      });

      const events = await Promise.all(
        records.map((entry) => readHeadsUp(log, settings, entry.record)),
      );

      return events.filter((event) => event !== null);
    },
    render: (detail) =>
      `Compaction in about ${formatTokens(detail.tokensLeft)} tokens (at ${String(Math.round(detail.threshold * 100))}% of the window). Save anything worth keeping now.`,
  };
}

// the most turn ends one note reads, past which the block's count of more stops growing
const readLimit = 1000;

async function readHeadsUp(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  settings: Pick<CompactionSettings, 'threshold' | 'headsUp'>,
  record: LogRecord,
): Promise<NotedEvent<CompactionHeadsUp> | null> {
  const tokensLeft = findCompactionHeadsUp(toContext(record), settings);

  if (tokensLeft === null) {
    return null;
  }

  const [opened] = await readRecords(log, {
    afterSequence: 0,
    beforeSequence: record.sequence,
    thread: conversationTaskID,
    kinds: ['model.session_opened'],
    order: 'newest',
    limit: 1,
  });

  const earlier = await readEarlierHeadsUp(log, settings.headsUp, {
    after: opened?.record.sequence ?? 0,
    before: record.sequence,
  });

  if (earlier !== null) {
    return null;
  }

  return {
    sequence: record.sequence,
    at: record.recordedAt.getTime(),
    detail: { tokensLeft, threshold: settings.threshold },
  };
}

interface TurnSpan {
  readonly after: number;
  readonly before: number;
}

// The newest earlier turn of the session that ended past the heads-up, read a page at a time back
// to the session's opening, or null when none did.
async function readEarlierHeadsUp(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  headsUp: number,
  span: TurnSpan,
): Promise<LogRecord | null> {
  const page = await readRecords(log, {
    afterSequence: span.after,
    beforeSequence: span.before,
    thread: conversationTaskID,
    kinds: ['model.turn_ended'],
    order: 'newest',
    limit: pageSize,
  });

  const found = page.find((entry) => isCompactionDue(toContext(entry.record), headsUp));
  const oldest = page.at(-1);

  if (found !== undefined || oldest === undefined || page.length < pageSize) {
    return found?.record ?? null;
  }

  return readEarlierHeadsUp(log, headsUp, { after: span.after, before: oldest.record.sequence });
}

// the turn ends one read of a session's earlier turns takes
const pageSize = 100;

// a turn whose model calls reported no usage gives no context
function toContext(record: LogRecord): ContextSize | null {
  const ended = modelTurnEndedCodec.tryDecodePartial(record.payload);

  return ended?.contextSize === undefined || ended.contextWindow === undefined
    ? null
    : { size: ended.contextSize, window: ended.contextWindow };
}

// a count of at least a thousand rounds to thousands, as "40k"
function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${String(Math.round(tokens / 1000))}k` : String(tokens);
}
