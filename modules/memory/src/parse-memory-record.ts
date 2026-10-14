import type { ContentSource, EnvelopeRecord, JSONObject } from '@heynixie/log';
import { z } from 'zod';
import type { MemoryChange, MemoryOrigin, QuoteEvidence, VersionState } from './types';

const quoteEvidence = z.strictObject({
  recordSequence: z.int(),
  start: z.int(),
  end: z.int(),
});

const versionAdded = z.strictObject({
  itemID: z.string(),
  version: z.int().min(1),
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']),
  state: z.enum(['active', 'retired']),
  sealed: z.base64(),
  evidence: quoteEvidence.nullable(),
  intentEvidence: quoteEvidence.nullable(),
  origin: z.enum(['owner', 'conversation', 'task', 'memory_writer']),
  source: z.enum(['owner', 'owner_data', 'untrusted']),
  taskID: z.string().nullable(),
  proposalID: z.string().nullable(),
  checks: z.record(z.string(), z.json()).nullable(),

  // a version from before the gate carries neither
  model: z.string().nullable().default(null),
  noticeKey: z.string().nullable().default(null),

  // a created version carries its item's short ID; any other version, and a version from before
  // short IDs, carries none
  shortID: z.string().nullable().default(null),
});

const pinned = z.strictObject({ itemID: z.string(), isPinned: z.boolean() });
const forgetStarted = z.strictObject({
  itemID: z.string(),
  version: z.int().min(1),

  // the sequences of the messages that backed any version of the item; a forget from before the
  // gate carries none
  evidenceSequences: z.array(z.int()).default([]),
});
const forgotten = z.strictObject({ itemID: z.string() });

interface VersionAddedRecord {
  readonly kind: 'memory.version_added';
  readonly itemID: string;
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;
  readonly sealed: string;
  readonly evidence: QuoteEvidence | null;
  readonly intentEvidence: QuoteEvidence | null;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly taskID: string | null;
  readonly proposalID: string | null;
  readonly checks: JSONObject | null;
  readonly model: string | null;

  // the turn's or the batch's notice the version joins, or null for your own action
  readonly noticeKey: string | null;

  // the short ID a created version gives its item, or null
  readonly shortID: string | null;
}

// The memory records the memory projections fold, each with its plain payload. A version's text
// sits in the payload sealed under the item's key, so the fold rebuilds every version without the
// record's erasable fields, and a forget of the item's key reaches the log's copy too.
export type MemoryRecord =
  | VersionAddedRecord
  | { readonly kind: 'memory.pinned'; readonly itemID: string; readonly isPinned: boolean }
  | {
      readonly kind: 'memory.forget_started';
      readonly itemID: string;
      readonly version: number;
      readonly evidenceSequences: readonly number[];
    }
  | { readonly kind: 'memory.forgotten'; readonly itemID: string };

// Reads a memory record's payload into its typed shape, or null for a record of another kind. A
// memory record whose payload breaks its shape throws, so a fold never writes a half-read row.
export function parseMemoryRecord(record: EnvelopeRecord): MemoryRecord | null {
  if (record.kind === 'memory.version_added') {
    return { kind: record.kind, ...versionAdded.parse(record.payload) };
  }
  if (record.kind === 'memory.pinned') {
    return { kind: record.kind, ...pinned.parse(record.payload) };
  }
  if (record.kind === 'memory.forget_started') {
    return { kind: record.kind, ...forgetStarted.parse(record.payload) };
  }
  if (record.kind === 'memory.forgotten') {
    return { kind: record.kind, ...forgotten.parse(record.payload) };
  }
  return null;
}
