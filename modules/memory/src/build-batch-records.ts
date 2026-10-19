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

// The batch's record, which advances the cursor, its notices and a record for each flag it kept: a
// live batch that applied writes adds a quiet notice, and the batch that ends the catch-up adds one
// notice with the count of everything the catch-up remembered.
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

interface NoticeFields {
  readonly notice: 'batch' | 'catch_up';
  readonly versions: readonly VersionRef[];
  readonly count: number;
}

// a quiet notice in the conversation's thread, with no push and no entry in the approval digest
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

// The flag's text is the model's line about your message, so it goes in the erasable fields and
// counts as outside content. It sits in the conversation's thread, beside the notices.
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

function toRefJSON(ref: VersionRef): JSONObject {
  return { itemID: ref.itemID, version: ref.version };
}

function toUsageJSON(usage: WriterUsage): JSONObject {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}
