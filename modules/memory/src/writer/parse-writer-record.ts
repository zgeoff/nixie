import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';

const versionRef = z.strictObject({ itemID: z.string(), version: z.int().min(1) }).readonly();

const usage = z
  .strictObject({
    inputTokens: z.int().nonnegative(),
    outputTokens: z.int().nonnegative(),
    cacheReadTokens: z.int().nonnegative(),
    cacheWriteTokens: z.int().nonnegative(),
  })
  .readonly();

const writerStarted = z
  .strictObject({ startSequence: z.int().nonnegative(), at: z.int() })
  .readonly();

const batchPlanned = z
  .strictObject({
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
    mode: z.enum(['catch_up', 'live']),
    at: z.int(),
  })
  .readonly();

const batchPublished = z
  .strictObject({
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
    mode: z.enum(['catch_up', 'live']),
    at: z.int(),
    applied: z.array(versionRef).readonly(),
    proposed: z.int().nonnegative(),
    dropped: z.int().nonnegative(),
    catchUpEnded: z.boolean(),
    model: z.string().nullable(),
    profile: z.string().nullable(),
    usage: usage.nullable(),
  })
  .readonly();

const writerFailed = z
  .strictObject({
    code: z.string(),
    failures: z.int().positive(),
    retryAt: z.int(),
    at: z.int(),
  })
  .readonly();

export type WriterRecord =
  | ({ readonly kind: 'memory.writer_started' } & z.infer<typeof writerStarted>)
  | ({ readonly kind: 'memory.batch_planned' } & z.infer<typeof batchPlanned>)
  | ({ readonly kind: 'memory.batch_published' } & z.infer<typeof batchPublished>)
  | ({ readonly kind: 'memory.writer_failed' } & z.infer<typeof writerFailed>);

export function parseWriterRecord(record: EnvelopeRecord): WriterRecord | null {
  if (record.kind === 'memory.writer_started') {
    return { kind: record.kind, ...writerStarted.parse(record.payload) };
  }

  if (record.kind === 'memory.batch_planned') {
    return { kind: record.kind, ...batchPlanned.parse(record.payload) };
  }

  if (record.kind === 'memory.batch_published') {
    return { kind: record.kind, ...batchPublished.parse(record.payload) };
  }

  if (record.kind === 'memory.writer_failed') {
    return { kind: record.kind, ...writerFailed.parse(record.payload) };
  }

  return null;
}
