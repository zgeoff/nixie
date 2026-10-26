import { z } from 'zod';
import { memoryExportSchemaVersion } from './memory-export-schema-version';

const originSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer', 'lapse']);
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
  until: z.iso.datetime().nullable(),
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

const reflectionSchema = z.strictObject({
  reflectionID: z.string(),
  model: z.string(),
  writtenAt: z.iso.datetime(),
  text: z.string().nullable(),
});

const spanRecordSchema = z.strictObject({
  sequence: z.int().positive(),
  kind: z.string(),
  recordedAt: z.iso.datetime(),
  source: z.enum(['owner', 'owner_data', 'untrusted', 'nixie']),
  payload: z.record(z.string(), z.unknown()).nullable(),
  decision: z.enum(['allow', 'ask', 'deny']).nullable(),
  text: z.string().nullable(),
  isGap: z.boolean(),
});

const readableMomentSchema = z.strictObject({
  momentID: z.string(),
  shortID: z.string(),
  state: z.enum(['active', 'retired']),
  thread: z.string(),
  firstSequence: z.int().positive(),
  lastSequence: z.int().positive(),
  keptBy: z.enum(['owner', 'model']),
  keptThread: z.string().nullable(),
  keptModel: z.string().nullable(),
  keptAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  title: z.string().nullable(),
  note: z.string().nullable(),
  reflections: z.array(reflectionSchema),
  links: z.array(z.string()),
  records: z.array(spanRecordSchema),
});

const destroyedMomentSchema = z.strictObject({
  momentID: z.string(),
  destroyedAt: z.iso.datetime().nullable(),
});

export const memoryExportSchema = z.strictObject({
  header: z.strictObject({
    schemaVersion: z.literal(memoryExportSchemaVersion),
    exportedAt: z.iso.datetime(),
    snapshotHash: z.string(),
  }),
  items: z.array(z.union([readableItemSchema, forgottenItemSchema])),
  moments: z.array(z.union([readableMomentSchema, destroyedMomentSchema])),
});

export type MemoryExport = z.infer<typeof memoryExportSchema>;

export type MemoryExportItem = MemoryExport['items'][number];

export type MemoryExportMoment = MemoryExport['moments'][number];
