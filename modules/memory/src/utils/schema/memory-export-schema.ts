import { ownerImageMediaTypes } from '@heynixie/tasks';
import { z } from 'zod';
import {
  earlierMemoryExportSchemaVersion,
  memoryExportSchemaVersion,
} from './memory-export-schema-version';

const originSchema = z.enum(['owner', 'conversation', 'task', 'lapse']);
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

const versionShape = {
  version: z.int().positive(),
  change: z.enum(['created', 'edited', 'retired', 'restored', 'undone']),
  state: z.enum(['active', 'retired']),
  text: z.string().nullable(),
  evidenceQuote: z.string().nullable(),
  until: z.iso.datetime().nullable(),
  provenance: provenanceSchema,
};

// A purge removed the text and the quote of a removed version, and wrote a bridge version, whose
// change and origin are not the owner's edit.
const purgeMarksShape = {
  isRemoved: z.boolean(),
  isBridge: z.boolean(),
};

const versionSchema = z.strictObject({ ...versionShape, ...purgeMarksShape });
const earlierVersionSchema = z.strictObject(versionShape);

const labelFieldsShape = {
  gist: z.string(),
  topic: z.string(),
  triggers: z.array(z.string()),
};

const labelHistoryShape = {
  revision: z.int().positive(),
  version: z.int().positive(),
  change: z.enum(['written', 'edited', 'backfilled']),
  ...labelFieldsShape,
};

const labelHistorySchema = z.strictObject({ ...labelHistoryShape, isBridge: z.boolean() });
const earlierLabelHistorySchema = z.strictObject(labelHistoryShape);

const itemShape = {
  itemID: z.string(),
  shortID: z.string(),
  state: z.enum(['active', 'retired']),
  isPinned: z.boolean(),
  subject: z.enum(['owner', 'self', 'shared']),
  labels: z.strictObject(labelFieldsShape).nullable(),
};

const readableItemSchema = z.strictObject({
  ...itemShape,
  versions: z.array(versionSchema).min(1),
  labelHistory: z.array(labelHistorySchema),
});

const earlierReadableItemSchema = z.strictObject({
  ...itemShape,
  versions: z.array(earlierVersionSchema).min(1),
  labelHistory: z.array(earlierLabelHistorySchema),
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

const imagePointerSchema = z.strictObject({
  // oxlint-disable-next-line id-length -- the pointer's field is n, as the number input of log.read_image names it
  n: z.int().positive(),
  mediaType: z.enum(ownerImageMediaTypes),
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
  isRemoved: z.boolean(),
  images: z.array(imagePointerSchema),
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

const headerShape = {
  exportedAt: z.iso.datetime(),
  snapshotHash: z.string(),
};

const currentExportSchema = z.strictObject({
  header: z.strictObject({ schemaVersion: z.literal(memoryExportSchemaVersion), ...headerShape }),
  items: z.array(z.union([readableItemSchema, forgottenItemSchema])),
  moments: z.array(z.union([readableMomentSchema, destroyedMomentSchema])),
});

// The file of the version before reads as if no purge had touched it.
const earlierExportSchema = z
  .strictObject({
    header: z.strictObject({
      schemaVersion: z.literal(earlierMemoryExportSchemaVersion),
      ...headerShape,
    }),
    items: z.array(z.union([earlierReadableItemSchema, forgottenItemSchema])),
    moments: z.array(z.union([readableMomentSchema, destroyedMomentSchema])),
  })
  .transform((file) => ({
    ...file,
    items: file.items.map((item) =>
      'versions' in item
        ? {
            ...item,
            versions: item.versions.map((version) => ({
              ...version,
              isRemoved: false,
              isBridge: false,
            })),
            labelHistory: item.labelHistory.map((entry) => ({ ...entry, isBridge: false })),
          }
        : item,
    ),
  }));

export const memoryExportSchema = z.union([currentExportSchema, earlierExportSchema]);

export type MemoryExport = z.infer<typeof currentExportSchema>;

export type MemoryExportItem = MemoryExport['items'][number];

export type MemoryExportMoment = MemoryExport['moments'][number];
