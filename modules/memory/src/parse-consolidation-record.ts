import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';

const versionRef = z.strictObject({ itemID: z.string(), version: z.int().min(1) }).readonly();

const change = z
  .strictObject({
    changeID: z.string(),
    kind: z.enum(['merge', 'rewrite', 'retire']),
    itemID: z.string(),
    inputs: z.array(versionRef).min(1).readonly(),
    source: z.enum(['owner', 'owner_data', 'untrusted']),
    actionHash: z.string(),
    sealed: z.base64(),
    lapseAt: z.int(),
  })
  .readonly();

const proposed = z
  .strictObject({
    diffID: z.string(),
    at: z.int(),
    model: z.string().nullable(),
    shownItems: z.int().min(0),
    changes: z.array(change).readonly(),
  })
  .readonly();

const share = z.strictObject({ itemID: z.string(), sealed: z.base64() }).readonly();

const summarized = z
  .strictObject({
    diffID: z.string(),
    sealed: z.base64(),
    shares: z.array(share).min(1).readonly(),
    lapseAt: z.int(),
  })
  .readonly();

const approved = z
  .strictObject({
    changeID: z.string(),
    approvalID: z.string(),
    actionHash: z.string(),
    identityID: z.string(),
  })
  .readonly();

const rejected = z.strictObject({ changeID: z.string(), identityID: z.string() }).readonly();
const lapsed = z.strictObject({ changeID: z.string() }).readonly();

const commented = z
  .strictObject({ changeID: z.string(), runID: z.string(), sealed: z.base64() })
  .readonly();

// The records of memory consolidation: a run's diff and the summary its session left for you, then
// your approval or rejection of each of its changes, a change's lapse, or the conversation's comment
// on a change.
export type ConsolidationRecord =
  | ({ readonly kind: 'memory.consolidation_proposed' } & z.infer<typeof proposed>)
  | ({ readonly kind: 'memory.consolidation_summarized' } & z.infer<typeof summarized>)
  | ({ readonly kind: 'memory.consolidation_approved' } & z.infer<typeof approved>)
  | ({ readonly kind: 'memory.consolidation_rejected' } & z.infer<typeof rejected>)
  | ({ readonly kind: 'memory.consolidation_lapsed' } & z.infer<typeof lapsed>)
  | ({ readonly kind: 'memory.consolidation_commented' } & z.infer<typeof commented>);

// Reads a consolidation record's payload into its typed shape, or null for a record of another
// kind. A consolidation record whose payload breaks its shape throws, so a fold never writes a
// half-read row.
export function parseConsolidationRecord(record: EnvelopeRecord): ConsolidationRecord | null {
  if (record.kind === 'memory.consolidation_proposed') {
    return { kind: record.kind, ...proposed.parse(record.payload) };
  }

  if (record.kind === 'memory.consolidation_summarized') {
    return { kind: record.kind, ...summarized.parse(record.payload) };
  }

  if (record.kind === 'memory.consolidation_commented') {
    return { kind: record.kind, ...commented.parse(record.payload) };
  }

  return parseAnswerRecord(record);
}

// the records that close a change: your approval or rejection, or its lapse
function parseAnswerRecord(record: EnvelopeRecord): ConsolidationRecord | null {
  if (record.kind === 'memory.consolidation_approved') {
    return { kind: record.kind, ...approved.parse(record.payload) };
  }

  if (record.kind === 'memory.consolidation_rejected') {
    return { kind: record.kind, ...rejected.parse(record.payload) };
  }

  if (record.kind === 'memory.consolidation_lapsed') {
    return { kind: record.kind, ...lapsed.parse(record.payload) };
  }

  return null;
}
