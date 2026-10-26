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

const keepSchema = z.object({
  clientActionID: z.uuid(),
  firstSequence: z.int().nonnegative(),
  lastSequence: z.int().nonnegative(),
  thread: z.string().min(1).max(200),
  title: z.string().min(1).max(120).regex(/\S/u),
});

export const momentContract = {
  keepMoment: momentKeep
    .input(keepSchema)
    .output(z.object({ momentID: z.string(), shortID: z.string() })),

  previewMomentDestroy: momentView.input(momentTargetSchema).output(destroyPreviewSchema),

  destroyMoment: momentView
    .errors(reusedIDErrors)
    .input(momentTargetSchema.extend({ clientActionID: z.uuid() }))
    .output(z.object({ momentID: z.string() })),
};
