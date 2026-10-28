import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const momentView = signedIn.errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
  MOMENT_NOT_FOUND: { message: 'No moment has this ID', status: 404 },
  STALE_VERSION: { message: 'The moment has moved past that version', status: 409 },
});

const momentIDSchema = z.string().min(1).max(200);
const momentTargetSchema = z.object({ momentID: momentIDSchema, version: z.int().positive() });

const reflectionSchema = z.object({
  model: z.string(),
  text: z.string().nullable(),
  writtenAt: z.date(),
});

const destroyPreviewSchema = z.object({
  keptAt: z.date(),
  keptBy: z.enum(['owner', 'model']),
  kept: z.object({ records: z.int().nonnegative() }),
  lost: z.object({ links: z.int().nonnegative(), texts: z.int().nonnegative() }),
  momentID: z.string(),
  note: z.string().nullable(),
  reflections: z.array(reflectionSchema),
  shortID: z.string(),
  state: z.enum(['active', 'retired']),
  thread: z.string(),
  title: z.string().nullable(),
  version: z.int().positive(),
});

const momentKeep = signedIn.errors(reusedIDErrors).errors({
  MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
  BAD_SPAN: {
    message: 'The span needs a first and a last record on the thread, in order',
    status: 422,
  },
});

const titleSchema = z.string().min(1).max(120).regex(/\S/u);

const keepSchema = z.object({
  clientActionID: z.uuid(),
  firstSequence: z.int().nonnegative(),
  lastSequence: z.int().nonnegative(),
  thread: z.string().min(1).max(200),
  title: titleSchema,
});

const momentSummarySchema = z.object({
  editedAt: z.date().nullable(),
  keptAt: z.date(),
  keptBy: z.enum(['owner', 'model']),
  momentID: z.string(),
  shortID: z.string(),
  state: z.enum(['active', 'retired']),
  title: z.string().nullable(),
});

const momentListSchema = z.object({
  before: z.int().nonnegative().optional(),
  includeRetired: z.boolean(),
  query: z.string().max(500).optional(),
});

const linkSchema = z.object({
  itemID: z.string(),
  shortID: z.string(),
  text: z.string().nullable(),
});

const noteSchema = z.object({ text: z.string(), writtenAt: z.date() });
const shownReflectionSchema = reflectionSchema.extend({ reflectionID: z.string() });

const momentDetailSchema = momentSummarySchema.extend({
  firstSequence: z.int().nonnegative(),
  lastSequence: z.int().nonnegative(),
  links: z.array(linkSchema),
  note: noteSchema.nullable(),
  reflections: z.array(shownReflectionSchema),
  thread: z.string(),
  titleBy: z.enum(['owner', 'model']),
  version: z.int().positive(),
});

const spanRecordSchema = z.object({
  isGap: z.boolean(),
  kind: z.string(),
  recordedAt: z.date(),
  sequence: z.int().nonnegative(),
  text: z.string().nullable(),
  tool: z.string().nullable(),
});

const momentChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('title'), title: titleSchema }),
  z.object({
    kind: z.literal('edges'),
    firstSequence: z.int().nonnegative(),
    lastSequence: z.int().nonnegative(),
  }),
  z.object({ kind: z.literal('note'), note: z.string().min(1).max(4000).regex(/\S/u) }),
  z.object({ kind: z.literal('reflection_removed'), reflectionID: z.string().min(1).max(200) }),
]);

const momentChange = momentView.errors(reusedIDErrors);

export const momentContract = {
  keepMoment: momentKeep
    .input(keepSchema)
    .output(z.object({ momentID: z.string(), shortID: z.string() })),

  listMoments: signedIn
    .errors({
      MEMORY_NOT_STARTED: { message: 'The memory store has not started yet', status: 503 },
    })
    .input(momentListSchema)
    .output(
      z.object({ moments: z.array(momentSummarySchema), next: z.int().nonnegative().nullable() }),
    ),

  readMoment: momentView.input(z.object({ momentID: momentIDSchema })).output(momentDetailSchema),

  readMomentSpan: momentView
    .input(z.object({ momentID: momentIDSchema, after: z.int().nonnegative().optional() }))
    .output(
      z.object({ records: z.array(spanRecordSchema), next: z.int().nonnegative().nullable() }),
    ),

  editMoment: momentChange
    .errors({
      BAD_SPAN: {
        message: 'The span needs a first and a last record on the thread, in order',
        status: 422,
      },
      REFLECTION_NOT_FOUND: { message: 'The moment has no reflection with this ID', status: 404 },
    })
    .input(momentTargetSchema.extend({ clientActionID: z.uuid(), change: momentChangeSchema }))
    .output(z.object({ momentID: z.string(), version: z.int().positive() })),

  linkMoment: momentChange
    .errors({
      MEMORY_ITEM_NOT_FOUND: { message: 'No memory item has this ID', status: 404 },
      ALREADY_LINKED: { message: 'The item is already linked to the moment', status: 409 },
      NOT_LINKED: { message: 'The item is not linked to the moment', status: 409 },
    })
    .input(
      momentTargetSchema.extend({
        clientActionID: z.uuid(),
        isLinked: z.boolean(),
        itemID: z.string().min(1).max(200),
      }),
    )
    .output(z.object({ momentID: z.string(), version: z.int().positive() })),

  previewMomentDestroy: momentView.input(momentTargetSchema).output(destroyPreviewSchema),

  destroyMoment: momentView
    .errors(reusedIDErrors)
    .input(momentTargetSchema.extend({ clientActionID: z.uuid() }))
    .output(z.object({ momentID: z.string() })),
};
