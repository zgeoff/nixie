import { z } from 'zod';
import { memoryExportSchemaVersion } from './memory-export-schema-version';

const originSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer']);
const sourceSchema = z.enum(['owner', 'owner_data', 'untrusted']);

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

const versionSchema = z.strictObject({
  version: z.int().positive(),
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']),
  state: z.enum(['active', 'retired']),
  text: z.string().nullable(),
  evidenceQuote: z.string().nullable(),
  provenance: provenanceSchema,
});

const readableItemSchema = z.strictObject({
  itemID: z.string(),
  shortID: z.string(),
  state: z.enum(['active', 'retired']),
  isPinned: z.boolean(),
  subject: z.enum(['owner', 'self', 'shared']),
  versions: z.array(versionSchema).min(1),
});

const forgottenItemSchema = z.strictObject({
  itemID: z.string(),
  forgottenAt: z.iso.datetime().nullable(),
});

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
