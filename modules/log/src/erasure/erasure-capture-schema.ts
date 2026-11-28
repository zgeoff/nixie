import type { ReadonlyDeep } from '@zgeoff/std';
import { z } from 'zod';

const idsSelection = z.strictObject({ ids: z.array(z.string()) });
const familySelection = z.strictObject({ family: z.string() });
const threadSelection = z.strictObject({ thread: z.string() });
const keySelectionSchema = z.union([idsSelection, familySelection, threadSelection]);
const noteCause = z.strictObject({ noteID: z.string() });
const momentCause = z.strictObject({ momentID: z.string() });
const itemCause = z.strictObject({ itemID: z.string() });

// `callSequences` lists the task.start calls that hold a brief the record forget removes, whose
// sessions the forget cleans first
const recordCause = z.strictObject({
  recordSequence: z.int(),
  callSequences: z.array(z.int()).exactOptional(),
});

// The conversation reset names its thread. Its session ends before the start, so the cleanup has
// nothing left to do.
const threadCause = z.strictObject({ thread: z.string() });

// `wakeSequences` lists the records of the wakes that show the connection's mail, whose sessions
// the forget cleans
const connectionCause = z.strictObject({
  connectionID: z.string(),
  wakeSequences: z.array(z.int()).exactOptional(),
});

// `wakeSequences` lists the records of the wakes that show the text, whose sessions the forget cleans
const textCause = z.strictObject({ textID: z.string(), wakeSequences: z.array(z.int()) });

const sessionCauseSchema = z.union([
  noteCause,
  momentCause,
  itemCause,
  recordCause,
  connectionCause,
  textCause,
  threadCause,
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
