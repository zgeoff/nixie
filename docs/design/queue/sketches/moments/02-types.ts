// Moments: every agreed shape. Not compiled. No package imports this file.
// Where a doc and this file differ, this file wins for shapes and the doc wins for rules.
//
// Not agreed, and so not binding:
// - The parameter list of pickCleanedTaskIDs is this sketch's reading. Only its name and what it
//   decides are agreed. (open: pick signature)
// - Sections F, G and H hold shapes that wait for a choice. (open: redaction parts)
// - A moment across threads, replay checks and rule reasons have no shape here.

// ---- A. The cause of a session cleanup ----

// The sessions module owns this type. The forget fix uses it as it is built.
export type SessionCleanupCause =
  | { readonly itemID: string } // a forgotten memory item
  | { readonly recordSequence: number } // a forgotten record
  | { readonly momentID: string }; // a destroyed moment

// The payload of model.session_invalidated and of model.session_cleanup_completed is the cause.
// The fix adds no record kind, migration, config key, tool or API procedure.

export interface CleanupCandidate {
  readonly taskID: string;
  readonly setup: TaskSetup | null; // TaskSetup is the tasks module's type
}

// recordThread is the thread of the forgotten record when the cause is { recordSequence }.
// It is null for { itemID } and for { momentID }. (open: pick signature)
export declare function pickCleanedTaskIDs(
  candidates: readonly CleanupCandidate[],
  recordThread: string | null,
): readonly string[];

// ---- B. A span record with its images ----

// The memory module owns both types. buildSpanEntry builds a MomentSpanEntry.
export interface MomentSpanImage {
  readonly n: number; // an integer from 1; the `number` that log.read_image takes
  readonly mediaType: string; // one of imageLimits.mediaTypes
}

export interface MomentSpanEntry {
  readonly sequence: number;
  readonly kind: RecordKind;
  readonly recordedAt: number;
  readonly source: ContentSource | 'nixie';
  readonly payload: JSONObject | null;
  readonly decision: 'allow' | 'ask' | 'deny' | null;
  readonly text: string | null;
  readonly images: readonly MomentSpanImage[]; // empty for every record with no readable image
  readonly isGap: boolean;
  readonly isCut: boolean;
}

// ---- C. One record of a moment.read result ----

// toEntryJSON of the moment.read tool returns this for each MomentSpanEntry.
interface MomentReadRecord {
  eventID: string; // the record's sequence as a string
  kind: string;
  recordedAt: string; // ISO 8601
  source: 'owner' | 'owner_data' | 'untrusted' | 'nixie';
  payload: JSONObject | null;
  decision: 'allow' | 'ask' | 'deny' | null;
  text: string | null;
  images: { n: number; mediaType: string }[];
  isGap: boolean;
  isCut: boolean;
}

// The `record` that the tool stores for its own call holds references only:
// { momentID, version, reflectionIDs, eventIDs, next }. It holds no image list.
// The IDs in it: short-ids.md.

// ---- D. The span record of the memory export ----

const spanImageSchema = z.strictObject({
  n: z.int().positive(),
  mediaType: z.string(),
});

const spanRecordSchema = z.strictObject({
  sequence: z.int().positive(),
  kind: z.string(),
  recordedAt: z.iso.datetime(),
  source: z.enum(['owner', 'owner_data', 'untrusted', 'nixie']),
  payload: z.record(z.string(), z.unknown()).nullable(),
  decision: z.enum(['allow', 'ask', 'deny']).nullable(),
  text: z.string().nullable(),
  images: z.array(spanImageSchema), // a file of the version before reads with []
  isGap: z.boolean(),
});

// memoryExportSchemaVersion is 6 as built. The photos slice raises it by one.
// When photos and the removal mark of section G ship in one release, the version rises once,
// to 7, for `images` and `isRemoved` together. In separate releases it rises once for each.
export const memoryExportSchemaVersion = 7;

// ---- E. log.read_image, its limits and its refusals ----

// The input, as built. The photos slice changes only the 2 tool descriptions.
interface LogReadImageInput {
  eventID: string; // pattern ^#?[1-9][0-9]{0,14}$
  number: number; // an integer from 1 to 100
}

// The limits, as built:
// - imageLimits: a message of yours takes 4 images of 5 MB each.
// - sessionImageBudget: one session takes 100 images and 24 MiB of base64.
// A message of 4 images of 5 MB each comes to about 26.7 MB of base64.

// The 2 refusals of log.read_image, word for word:
const imageUnavailable = 'image unavailable';

const imageUnavailableSessionFull =
  'image unavailable: this session holds as many images as it can take';

// The description of moment.read holds one sentence about images, and the description of
// log.read_image names moment.read as a source of the number. Neither sentence is written.
// (open: photo description sentences)

// ---- F. The forget of a record, as a redaction takes it ----
// (open: redaction parts)

// The input of the conversation.forget checked action, as built.
interface RecordForgetInput {
  clientActionID: string;
  thread: string;
  sequence: number;
}

// forgettableKinds, as built: owner_message and model.reply. The kinds of a redaction:
// (open: redaction kinds)
// The action answers RECORD_NOT_FOUND for a record of a kind outside the set.

// The 2 durable parts of a forget, in order: record.forget_started, then record.forgotten.

// ---- G. The removal mark ----
// (open: redaction parts)

// MomentSpanEntry, the span record of the API's moment contract and the span record of the
// memory export each hold:
interface RemovalMark {
  readonly isGap: boolean; // true for every gap, a removed record included
  readonly isRemoved: boolean; // true only for a record that a forget removed
}

// The export schema reads a file of the version before with isRemoved false.

// The moment view's sentence for a gap, as built:
const gapSentence =
  'Record {sequence}: this part is gone. It was forgotten, and the moment keeps its place.';

// The moment view words a removed record as "removed". The full sentence is not written.
// (open: removal sentence)

// ---- H. The preview read behind the removal control ----
// (open: redaction parts) (open: preview procedure name)

// A read procedure of the API, beside conversation.forget.
interface ForgetPreviewInput {
  thread: string;
  sequence: number;
}

interface ForgetPreviewOutput {
  momentCount: number; // the moments whose spans hold the record
  memoryItemCount: number; // the memory items whose evidence quotes the record
}

// The label of the control in the moment view, word for word:
const removalControlLabel = 'Remove this record';
