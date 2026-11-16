import type { LogRecord } from '@heynixie/contract';
import type { ReadonlyDeep } from '../types';
import type { store } from './store';

type StoredRecord = ReadonlyDeep<ReturnType<typeof store.records.all>[number]>;

export function toLogRecord(record: StoredRecord): LogRecord {
  return {
    ...(record.compaction === undefined ? {} : { compaction: toLogCompaction(record.compaction) }),
    ...(record.context === undefined ? {} : { context: { ...record.context } }),
    ...(record.exchangeNotice === undefined
      ? {}
      : { exchangeNotice: structuredClone(record.exchangeNotice) }),
    ...(record.forget === undefined ? {} : { forget: { ...record.forget } }),
    ...(record.isRemoved === undefined ? {} : { isRemoved: record.isRemoved }),
    kind: record.kind,
    ...(record.message === undefined ? {} : { message: toLogMessage(record.message) }),
    ...(record.proposal === undefined ? {} : { proposal: { ...record.proposal } }),
    ...(record.recall === undefined ? {} : { recall: toLogRecall(record.recall) }),
    recordedAt: record.recordedAt,
    ...(record.reminder === undefined ? {} : { reminder: { ...record.reminder } }),
    ...(record.removal === undefined ? {} : { removal: { ...record.removal } }),
    sequence: record.sequence,
    ...(record.stop === undefined
      ? {}
      : { stop: { cancelledActions: record.stop.cancelledActions.map(toLogAction) } }),
    ...(record.summary === undefined ? {} : { summary: { ...record.summary } }),
    ...(record.task === undefined ? {} : { task: structuredClone(record.task) }),
    ...(record.taskMessage === undefined
      ? {}
      : { taskMessage: structuredClone(record.taskMessage) }),
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

type LogAction = NonNullable<LogRecord['stop']>['cancelledActions'][number];

function toLogAction(action: Readonly<LogAction>): LogAction {
  return { actionID: action.actionID, tool: action.tool };
}
