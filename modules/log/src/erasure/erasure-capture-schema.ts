import type { ReadonlyDeep } from '@zgeoff/std';
import { z } from 'zod';

const idsSelection = z.strictObject({ ids: z.array(z.string()) });
const familySelection = z.strictObject({ family: z.string() });
const threadSelection = z.strictObject({ thread: z.string() });
const keySelectionSchema = z.union([idsSelection, familySelection, threadSelection]);
const noteCause = z.strictObject({ noteID: z.string() });
const momentCause = z.strictObject({ momentID: z.string() });
const itemCause = z.strictObject({ itemID: z.string() });
const recordCause = z.strictObject({ recordSequence: z.int() });
const connectionCause = z.strictObject({ connectionID: z.string() });

const sessionCauseSchema = z.union([
  noteCause,
  momentCause,
  itemCause,
  recordCause,
  connectionCause,
]);

const purgeSchema = z.strictObject({ recordSequence: z.int(), itemIDs: z.array(z.string()) });
const threadList = z.array(z.string());
const allThreads = z.literal('all');
const noThreads = z.literal('none');

const turnInputsSchema = z.strictObject({
  threads: z.union([threadList, allThreads, noThreads]),
  cleaned: z.boolean(),
  floor: z.int().nullable(),
});

// What the start transaction reads while the target still reads. It holds IDs and sequences only.
export const erasureCaptureSchema = z.strictObject({
  keys: keySelectionSchema,
  cleanupKeys: z.array(z.string()),
  sandboxCallIDs: z.array(z.string()),
  purges: z.array(purgeSchema),
  sessionCause: sessionCauseSchema,
  turnInputs: turnInputsSchema,
});

export type ErasureCapture = ReadonlyDeep<z.infer<typeof erasureCaptureSchema>>;
