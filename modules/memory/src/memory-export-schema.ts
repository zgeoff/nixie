import { z } from 'zod';
import { memoryExportSchemaVersion } from './memory-export-schema-version';

const originSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer']);
const sourceSchema = z.enum(['owner', 'owner_data', 'untrusted']);

// Where a version came from: who wrote it and from what, the task and proposal behind it, each
// write check's verdict, the models of the writer's call and of the checker, the definitions in
// force when it was written, and when.
const provenanceSchema = z.strictObject({
  origin: originSchema,
  source: sourceSchema,
  taskID: z.string().nullable(),
  proposalID: z.string().nullable(),
  checks: z.record(z.string(), z.unknown()).nullable(),
  writerModel: z.string().nullable(),
  checkerModel: z.string().nullable(),
  snapshotHash: z.string(),
  recordedAt: z.iso.datetime(),
});

// One version, with its text and the quote it was saved from. Text is null when the item's key or
// the version's ciphertext fails, and the quote is null then too, or when the version has none.
const versionSchema = z.strictObject({
  version: z.int().positive(),
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']),
  state: z.enum(['active', 'retired']),
  text: z.string().nullable(),
  evidenceQuote: z.string().nullable(),
  provenance: provenanceSchema,
});

// An item that is still yours to read, a fact or a self-note, with every version, oldest first.
const readableItemSchema = z.strictObject({
  itemID: z.string(),
  shortID: z.string(),
  state: z.enum(['active', 'retired']),
  isPinned: z.boolean(),
  kind: z.enum(['fact', 'self']),
  versions: z.array(versionSchema).min(1),
});

// A forgotten item: only its ID and when its forget completed, which is null while a forget that a
// crash cut short still runs.
const forgottenItemSchema = z.strictObject({
  itemID: z.string(),
  forgottenAt: z.iso.datetime().nullable(),
});

// The export file: a header with the export time, the schema version and the snapshot hash of the
// definitions in force, then every item in the order it was created.
export const memoryExportSchema = z.strictObject({
  header: z.strictObject({
    schemaVersion: z.literal(memoryExportSchemaVersion),
    exportedAt: z.iso.datetime(),
    snapshotHash: z.string(),
  }),
  items: z.array(z.union([readableItemSchema, forgottenItemSchema])),
});

export type MemoryExport = z.infer<typeof memoryExportSchema>;

export type MemoryExportItem = MemoryExport['items'][number];
