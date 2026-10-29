import type { LogRecord } from '@heynixie/contract';
import type { ReadonlyDeep } from '../types';
import type { store } from './store';

type StoredRecord = ReadonlyDeep<ReturnType<typeof store.records.all>[number]>;

export function toLogRecord(record: StoredRecord): LogRecord {
  return {
    ...(record.compaction === undefined ? {} : { compaction: toLogCompaction(record.compaction) }),
    ...(record.context === undefined ? {} : { context: { ...record.context } }),
    ...(record.forget === undefined ? {} : { forget: { ...record.forget } }),
    kind: record.kind,
    ...(record.message === undefined ? {} : { message: toLogMessage(record.message) }),
    ...(record.rating === undefined ? {} : { rating: toLogRating(record.rating) }),
    ...(record.recall === undefined ? {} : { recall: toLogRecall(record.recall) }),
    recordedAt: record.recordedAt,
    ...(record.route === undefined
      ? {}
      : { route: { ...record.route, messages: [...record.route.messages] } }),
    sequence: record.sequence,
    ...(record.summary === undefined ? {} : { summary: { ...record.summary } }),
    ...(record.task === undefined ? {} : { task: structuredClone(record.task) }),
    thread: record.thread,
    ...(record.toolCall === undefined ? {} : { toolCall: structuredClone(record.toolCall) }),
  };
}

type LogCompaction = NonNullable<LogRecord['compaction']>;

function toLogCompaction(compaction: NonNullable<StoredRecord['compaction']>): LogCompaction {
  return {
    ...(compaction.postTokens === undefined ? {} : { postTokens: compaction.postTokens }),
    preTokens: compaction.preTokens,
    trigger: compaction.trigger,
  };
}

type LogMessage = NonNullable<LogRecord['message']>;

function toLogMessage(message: NonNullable<StoredRecord['message']>): LogMessage {
  const spans = message.spans?.map((span) => ({
    end: span.end,
    source: span.source,
    start: span.start,
  }));

  const images = message.images?.map((image) => ({ mediaType: image.mediaType }));

  return {
    ...(message.clientMessageId === undefined ? {} : { clientMessageId: message.clientMessageId }),
    ...(images === undefined ? {} : { images }),
    ...(spans === undefined ? {} : { spans }),
    text: message.text,
  };
}

type LogRating = NonNullable<LogRecord['rating']>;

function toLogRating(rating: NonNullable<StoredRecord['rating']>): LogRating {
  return {
    items: rating.items.map((item) => ({
      hasNote: item.hasNote,
      itemID: item.itemID,
      verdict: item.verdict,
      version: item.version,
    })),
    ...(rating.ratedBy === undefined ? {} : { ratedBy: rating.ratedBy }),
    recalledSequence: rating.recalledSequence,
  };
}

type LogRecall = NonNullable<LogRecord['recall']>;

function toLogRecall(recall: NonNullable<StoredRecord['recall']>): LogRecall {
  return {
    items: recall.items.map((item) =>
      item.score === undefined
        ? { itemID: item.itemID, version: item.version }
        : { itemID: item.itemID, score: item.score, version: item.version },
    ),
  };
}
