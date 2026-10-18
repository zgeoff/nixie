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
        records.map((entry) => findHeadsUp(log, settings, entry.record)),
      );

      return events.filter((event) => event !== null);
    },
    render: (detail) =>
      `Compaction in about ${formatTokens(detail.tokensLeft)} tokens (at ${String(Math.round(detail.threshold * 100))}% of the window). Save anything worth keeping now.`,
  };
}

// the most turn ends one note reads, past which the block's count of more stops growing
const readLimit = 1000;

async function findHeadsUp(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  settings: Pick<CompactionSettings, 'threshold' | 'headsUp'>,
  record: LogRecord,
): Promise<NotedEvent<CompactionHeadsUp> | null> {
  const tokensLeft = findCompactionHeadsUp(toContext(record), settings);

  if (tokensLeft === null) {
    return null;
  }

  const isRepeat = await hasEarlierHeadsUp(log, settings.headsUp, record);

  if (isRepeat) {
    return null;
  }

  return {
    sequence: record.sequence,
    at: record.recordedAt.getTime(),
    detail: { tokensLeft, threshold: settings.threshold },
  };
}

// whether an earlier turn of the same session, after the newest opening before this turn, already
// ended past the heads-up
async function hasEarlierHeadsUp(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  headsUp: number,
  record: LogRecord,
): Promise<boolean> {
  const [opened] = await readRecords(log, {
    afterSequence: 0,
    beforeSequence: record.sequence,
    thread: conversationTaskID,
    kinds: ['model.session_opened'],
    order: 'newest',
    limit: 1,
  });

  const earlier = await readRecords(log, {
    afterSequence: opened?.record.sequence ?? 0,
    beforeSequence: record.sequence,
    thread: conversationTaskID,
    kinds: ['model.turn_ended'],
  });

  return earlier.some((entry) => isCompactionDue(toContext(entry.record), headsUp));
}

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
