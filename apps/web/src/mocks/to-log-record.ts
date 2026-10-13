import type { LogRecord } from '@heynixie/contract';
import type { ReadonlyDeep } from '../types';
import type { store } from './store';

type StoredRecord = ReadonlyDeep<ReturnType<typeof store.records.all>[number]>;

// Copies a stored record into the shape the contract sends, so a caller never holds the store's
// own objects.
export function toLogRecord(record: StoredRecord): LogRecord {
  return {
    ...(record.compaction === undefined ? {} : { compaction: toLogCompaction(record.compaction) }),
    ...(record.context === undefined ? {} : { context: { ...record.context } }),
    kind: record.kind,
    ...(record.message === undefined ? {} : { message: toLogMessage(record.message) }),
    ...(record.recall === undefined ? {} : { recall: toLogRecall(record.recall) }),
    recordedAt: record.recordedAt,
    sequence: record.sequence,
    ...(record.task === undefined ? {} : { task: structuredClone(record.task) }),
    thread: record.thread,
    ...(record.toolCall === undefined ? {} : { toolCall: structuredClone(record.toolCall) }),
  };
}

type LogCompaction = NonNullable<LogRecord['compaction']>;

// keeps an after count only where one exists
function toLogCompaction(compaction: NonNullable<StoredRecord['compaction']>): LogCompaction {
  return {
    ...(compaction.postTokens === undefined ? {} : { postTokens: compaction.postTokens }),
    preTokens: compaction.preTokens,
    trigger: compaction.trigger,
  };
}

type LogRecall = NonNullable<LogRecord['recall']>;

// keeps a score only where one exists
function toLogRecall(recall: NonNullable<StoredRecord['recall']>): LogRecall {
  return {
    items: recall.items.map((item) =>
      item.score === undefined
        ? { itemID: item.itemID, version: item.version }
        : { itemID: item.itemID, score: item.score, version: item.version },
    ),
  };
}

type LogMessage = NonNullable<LogRecord['message']>;

function toLogMessage(message: NonNullable<StoredRecord['message']>): LogMessage {
  const spans = message.spans?.map((span) => ({
    end: span.end,
    source: span.source,
    start: span.start,
  }));

  return {
    ...(message.clientMessageId === undefined ? {} : { clientMessageId: message.clientMessageId }),
    ...(spans === undefined ? {} : { spans }),
    text: message.text,
  };
}
