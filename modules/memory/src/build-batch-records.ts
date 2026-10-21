import type { JSONObject, RecordInput } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { VersionRef } from './types';
import type { BatchOutcome } from './write-memory-batch';
import type { WriterParts } from './writer-parts';
import type { BatchBounds, BatchMode, StagedFlag, WriterRow, WriterUsage } from './writer-types';

export interface PublishedBatch {
  readonly row: WriterRow;
  readonly now: number;
  readonly bounds: BatchBounds;
  readonly mode: BatchMode;
  readonly catchUpEnded: boolean;
  readonly dropped: number;
  readonly usage: WriterUsage | null;
  readonly outcome: BatchOutcome;
}

export function buildBatchRecords(
  parts: Pick<WriterParts, 'context' | 'model'>,
  batch: PublishedBatch,
): readonly RecordInput[] {
  const applied = batch.outcome.applied;

  const catchUpCount =
    batch.row.catch_up_applied + (batch.mode === 'catch_up' ? applied.length : 0);

  const notices = [
    ...(batch.mode === 'live' && applied.length > 0
      ? [buildNotice(parts, { notice: 'batch', versions: applied, count: applied.length })]
      : []),
    ...(batch.catchUpEnded && catchUpCount > 0
      ? [buildNotice(parts, { notice: 'catch_up', versions: [], count: catchUpCount })]
      : []),
  ];

  const flags = batch.outcome.flags.map((flag) => buildFlagRecord(parts, flag));

  return [buildPublishedRecord(parts, batch), ...notices, ...flags];
}

interface NoticeFields {
  readonly notice: 'batch' | 'catch_up';
  readonly versions: readonly VersionRef[];
  readonly count: number;
}

function buildNotice(parts: Pick<WriterParts, 'context'>, fields: NoticeFields): RecordInput {
  return {
    kind: 'memory.notice',
    definitions: parts.context.definitions(),
    thread: conversationTaskID,
    payload: {
      notice: fields.notice,
      versions: fields.versions.map((ref) => toRefJSON(ref)),
      count: fields.count,
      isQuiet: true,
    },
  };
}

function toRefJSON(ref: VersionRef): JSONObject {
  return { itemID: ref.itemID, version: ref.version };
}

function buildFlagRecord(parts: Pick<WriterParts, 'context'>, flag: StagedFlag): RecordInput {
  return {
    kind: 'memory.self_note_flagged',
    definitions: parts.context.definitions(),
    thread: conversationTaskID,
    contentSource: 'untrusted',
    payload: { sourceSequence: flag.sourceSequence },
    erasable: { text: flag.text },
  };
}

function buildPublishedRecord(
  parts: Pick<WriterParts, 'context' | 'model'>,
  batch: PublishedBatch,
): RecordInput {
  const usage = batch.usage;

  return {
    kind: 'memory.batch_published',
    definitions: parts.context.definitions(),
    thread: memoryWriterTaskID,
    payload: {
      ...batch.bounds,
      mode: batch.mode,
      at: batch.now,
      applied: batch.outcome.applied.map((ref) => toRefJSON(ref)),
      proposed: batch.outcome.proposed,
      dropped: batch.dropped + batch.outcome.forgotten,
      catchUpEnded: batch.catchUpEnded,
      model: usage === null ? null : parts.model.model,
      profile: usage === null ? null : parts.model.profile,
      usage: usage === null ? null : toUsageJSON(usage),
    },
  };
}

function toUsageJSON(usage: WriterUsage): JSONObject {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}
