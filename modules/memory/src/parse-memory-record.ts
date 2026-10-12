import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';

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
});

const pinned = z.strictObject({ itemID: z.string(), isPinned: z.boolean() });
const forgetStarted = z.strictObject({ itemID: z.string(), version: z.int().min(1) });
const forgotten = z.strictObject({ itemID: z.string() });

// The memory records the memory projections fold, each with its plain payload. A version's text
// sits in the payload sealed under the item's key, so the fold rebuilds every version without the
// record's erasable fields, and a forget of the item's key reaches the log's copy too.
export type MemoryRecord =
  | ({ readonly kind: 'memory.version_added' } & z.infer<typeof versionAdded>)
  | ({ readonly kind: 'memory.pinned' } & z.infer<typeof pinned>)
  | ({ readonly kind: 'memory.forget_started' } & z.infer<typeof forgetStarted>)
  | ({ readonly kind: 'memory.forgotten' } & z.infer<typeof forgotten>);

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
