// Memory index: every agreed shape. Not compiled. No package imports this file.
// Where a doc and this file differ, this file wins for shapes and the doc wins for rules.
// The docs that point here: memory-labels.md, memory-revision.md, memory-index.md,
// memory-recall.md, memory-turn-push.md. Usage: 01-usage.ts. Flows: 03-flow.ts.
//
// These types exist in the code under these names, and this file does not repeat them:
// MemoryItem, MemoryRef, MatchScores, PastMessage, PinnedCoreUse, StoreParts, RecallRequest,
// MessageRecallRequest, VectorIndex, and MemoryIndex (the store's in-memory item index, which is
// not the memory index block).
//
// Not agreed, and so not binding:
// - The field names of SessionIndex and of TriggerMatch. (open: session index fields)
//   (open: trigger match shape)
// - The names of the 2 recall request members in section J. (open: recall request names)
// - The name of the page limit constant in section I. (open: page limit name)

// ---- A. The labels of an item ----

// The agent writes all 3. Each is one line: it holds no line break.
interface Labels {
  gist: string; // 1 to 80 characters
  topic: string; // 1 to 40 characters, such as "home" or "work/standups"
  triggers: string[]; // 0 to 5 trigger phrases, each 1 to 60 characters
}

// ---- B. The inputs of memory.remember and memory.edit ----

interface RememberInput {
  text: string; // required, 1 to 2,000 characters
  gist: string; // required, for every subject
  topic: string; // required, for every subject
  triggers?: string[]; // omitted: the item has no trigger phrase
  quote?: string;
  eventID?: string;
  image?: { eventID: string; number: number };
  subject?: 'owner' | 'self' | 'shared';
  until?: string;
}

interface EditInput {
  itemID: string; // required, a short ID
  version: number; // required: the revision the caller read (section D)
  text?: string;
  gist?: string;
  topic?: string;
  triggers?: string[]; // replaces the whole list; [] clears it
  // These 4 go only with `text`. A call with no `text` is a label-only edit.
  quote?: string;
  eventID?: string;
  until?: string;
  subject?: 'owner' | 'self' | 'shared';
}

// Both tools return this. `version` is the revision.
interface WriteOutput {
  status: string;
  itemID: string;
  version: number;
  proposalID: string | null;
  reason: string | null;
  merged: boolean;
}

// ---- C. Labels in memory.pending ----

// The input of memory.pending has no label member. Each proposal of its result that has a
// proposal label record (section F) shows these beside its other fields.
interface PendingProposalLabels {
  gist: string;
  topic: string;
  triggers: string[];
  isLabelOnly: boolean; // true: the proposal shows no text of its own
  version: number; // targetRevision when the proposal holds one; see memory-revision.md
}

// ---- D. The 2 numbers of an item ----

// Columns of memory_items.
interface MemoryItemNumbers {
  version: number; // the text version. A memory.version_added record moves it
  label_edits: number; // default 0. A memory.labelled record with change "edited" adds 1
}

// revision = version + label_edits. The store computes it on each read and stores it nowhere.

// ---- E. The item label record ----

// kind "memory.labelled". Not a strict shape. It always states the whole label set.
interface MemoryLabelled {
  itemID: string;
  revision: number; // the item's revision once this record lands
  version: number; // the text version in force. This record never moves it
  change: 'written' | 'edited' | 'backfilled';
  sealed: string; // Labels, under the item's key, at the place `labels/<itemID>/<revision>`
  origin: 'owner' | 'conversation' | 'task' | 'memory_writer' | 'lapse' | 'migration';
  source: 'owner' | 'owner_data' | 'untrusted';
  taskID: string | null;
  proposalID: string | null;
  model: string | null;
}

// ---- F. The proposal label record ----

// kind "memory.proposal_labelled". It sits beside memory.proposed, in the same commit.
interface MemoryProposalLabelled {
  proposalID: string;
  itemID: string;
  sealed: string; // the whole Labels the approval applies, at `proposal-labels/<proposalID>`
  targetRevision: number | null; // the revision the caller read; null for an item not yet written
  isLabelOnly: boolean;
}

// The memory.proposed record of a label-only proposal:
//   operation: "remember"
//   targetVersion: the item's text version at the call
//   text: a copy of the item's text

// ---- G. The projections ----

// memory_items:      label_edits (integer, default 0)
// memory_proposals:  sealed_labels, target_revision, is_label_only
// memory_labels, one row per memory.labelled record:
interface MemoryLabelsRow {
  item_id: string;
  revision: number;
  version: number;
  change: string;
  sealed: string;
  origin: string;
  source: string;
  task_id: string | null;
  proposal_id: string | null;
  model: string | null;
  sequence: number;
  recorded_at: number;
}

// memory_items and memory_proposals have no is_sensitive column.

// ---- H. memory.recall ----

type Subject = 'owner' | 'self' | 'shared';

interface RecallInput {
  // At most one of these 4. With none, the call is the plain list.
  query?: string;
  itemIDs?: string[]; // at most 100 short IDs
  topic?: string; // 1 to 40 characters; the match ignores case
  topics?: true;

  subjects?: Subject[]; // 1 to 3 distinct values; goes with any call
  includeRetired?: boolean; // refused with topic or topics
  includeHistory?: boolean; // refused with topic or topics
  limit?: number; // 1 to 100, 20 when omitted; refused with topic or topics
  after?: string; // the `next` of the page before; refused with query or itemIDs
  // The input has no `since` member.
}

// Exactly one of items, lines and topics. No other key.
interface RecallOutput {
  items?: RecalledItemWithLabels[];
  lines?: IndexLine[];
  topics?: TopicCount[];
  next: string | null;
  searched: Searched;
  leftOut?: LeftOut; // present only when the result omits an entry, or versions of an oversized
  // first item (open: leftOut for versions)
}

// Every field the recall tool returns for an item, and the 3 labels.
interface RecalledItemWithLabels {
  itemID: string;
  version: number; // the revision
  gist: string;
  topic: string;
  triggers: string[];
  // With includeHistory:
  history?: Array<{ textVersion: number /* and the version's other fields */ }>;
  labelHistory?: Array<{ revision: number; gist: string; topic: string; triggers: string[] }>;
  // ...text, subject, isPinned, about, quote, image, model, state, change, moment links
}

interface IndexLine {
  itemID: string; // a short ID
  gist: string;
  subject: Subject;
}

interface TopicCount {
  topic: string;
  subject: Subject;
  items: number;
}

// One of these 5, with `subjects` beside it when the call passed it.
type Searched = (
  | { query: string } // at most the first 200 characters of the query
  | { itemIDs: string[] }
  | { topic: string }
  | { topics: true }
  | {}
) & { subjects?: Subject[] };

interface LeftOut {
  count: number; // the items, lines or topics the result omits
  itemIDs: string[]; // their short IDs in order, for query and itemIDs; [] for every other call
  versions: number; // with includeHistory: versions of the first item that the result omits; else 0
}

// ---- I. The page limit ----

// In libs/wire, beside toolOutputLimitTokens. A constant, and not a config key.
// (open: page limit name)
export const recallPageLimitBytes = toolOutputLimitTokens * 2 - 4_000; // 20,000 at 12,000 tokens

// ---- J. What the recall tool gives the store ----

// 2 optional members of the store's RecallRequest. (open: recall request names)
interface RecallBudget {
  // The page limit less the bytes of the result's other fields at their largest: `searched`,
  // `next`, and a `leftOut` that names every ID the call could return.
  byteBudget?: number;
  // The UTF-8 bytes of one item as the tool returns it: its JSON with its history and its moment
  // links. It reads the links, so the store awaits it.
  measureItem?: (item: RecalledItem) => Promise<number>;
}

// ---- K. The memory index at a session's opening ----

// (open: session index fields)
interface SessionIndex {
  text: string; // the text of the memory-index block; "" when the block is omitted
  items: number; // for the first status line
  tokens: number; // for the second status line
  budget: number; // index_tokens
}

// ---- L. The port: what the sessions module asks of memory ----

interface ConversationMemory {
  readonly readPinnedCore: () => Promise<readonly MemoryItem[]>;
  readonly readPinnedCoreUse: () => Promise<PinnedCoreUse>;
  readonly readIndex: (ask: { readonly thread: string }) => Promise<SessionIndex>;
  readonly readTurnMemory: (ask: TurnMemoryAsk) => Promise<TurnMemory>;
  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

interface SessionHeld {
  readonly readVersions: () => Promise<readonly MemoryRef[]>; // lazy
  readonly readMessages: () => Promise<readonly number[]>; // lazy; no push reads it
}

interface TurnMemoryAsk {
  readonly text: string;
  readonly thread: string;
  readonly excludedWords: readonly string[];
  readonly held: SessionHeld;
}

type TurnMemory =
  | {
      readonly kind: 'placed';
      readonly items: readonly MemoryItem[];
      readonly selfNotes: readonly MemoryItem[];
      readonly messages: readonly PastMessage[]; // always empty: no push fills it
    }
  | { readonly kind: 'none' };

// ConversationMemorySettings holds rebuildTokens, ownerName and agentNames.

// ---- M. The selection, in the memory module ----

interface TurnMemorySettings {
  readonly trigger: { readonly items: number; readonly minScore: number };
}

interface ItemState {
  itemID: string;
  version: number; // the text version
  isPinned: boolean;
  isSelf: boolean;
  isLapsed: boolean;
}

interface TurnSources {
  readonly index: MemoryIndex; // the store's in-memory item index
  readonly vectors: VectorIndex | null; // null: the deployment has no encoder
  readonly triggers: TriggerIndex;
  readonly readItemStates: () => Promise<readonly ItemState[]>;
}

interface PushTurn {
  readonly text: string;
  readonly excludedWords: readonly string[];
  readonly held: SessionHeld;
  readonly states: readonly ItemState[];
  readonly excludedIDs: readonly string[];
}

interface PushPick extends MemoryRef, MatchScores {
  readonly isSelf: boolean;
  readonly push: 'trigger';
}

interface PushSelection {
  readonly picks: readonly PushPick[];
  readonly messages: readonly PastMessage[];
}

type SelectPush = (sources: TurnSources, turn: PushTurn) => Promise<PushSelection>;

type TurnSelection =
  | {
      readonly kind: 'selected';
      readonly picks: readonly PushPick[];
      readonly messages: readonly PastMessage[];
    }
  | { readonly kind: 'none' };

// One exported function a file.
declare function selectTurnMemory(
  sources: TurnSources,
  settings: TurnMemorySettings,
  ask: TurnMemoryAsk,
): Promise<TurnSelection>;

declare function pickTurnPushes(settings: TurnMemorySettings): readonly SelectPush[];

declare function buildPushExclusions(
  states: readonly ItemState[],
  held: readonly MemoryRef[],
): readonly string[];

declare function readTurnMemory(
  parts: StoreParts,
  settings: TurnMemorySettings,
  ask: TurnMemoryAsk,
): Promise<TurnMemory>;

declare function placeTurnMemory(
  parts: StoreParts,
  ask: TurnMemoryAsk,
  selection: Extract<TurnSelection, { kind: 'selected' }>,
): Promise<TurnMemory>;

// An in-memory search over trigger phrases. The store rebuilds it at each start.
interface TriggerIndex {
  readonly readMatches: (
    text: string,
    options: {
      limit: number;
      minScore: number;
      excludedIDs: readonly string[];
      excludedWords: readonly string[];
    },
  ) => Promise<readonly TriggerMatch[]>; // one match per item, scored by the item's best phrase
}

// (open: trigger match shape)
interface TriggerMatch extends MatchScores {
  itemID: string;
}

// ---- N. The config keys ----

// Keys of the memory config, under `memory:`. memoryConfigSchema is a strict object.
interface MemoryIndexConfig {
  index_tokens: number; // the index's token budget; 0 omits the block. Default 3,000
  index_fold_order: 'largest-first' | 'oldest-first'; // default "largest-first"
  index_item_order: 'newest-first'; // the one value
  index_topic_page: number; // the most lines of a topic page. Default 200
  trigger_items: number; // the most items trigger push places on a turn; 0 turns it off. Default 3
  trigger_min_score: number; // the floor a trigger match passes. (open: trigger floor)
}

// The schema has no retrieval_items, retrieval_self_notes, retrieval_messages,
// retrieval_min_score or retrieval_min_similarity key.

// ---- O. The memory export ----

// memoryExportSchema writes schema version 7. A version 7 item has no isSensitive member.
// It reads versions 5, 6 and 7.

// ---- P. Texts the model or the person reads ----

// The memory-index block. Each item is one line, `[shortID] gist`. (open: index details)
//
//   <the opening line>                                  (open: index opening line)
//   About Robin:
//     home (3):
//       - [b7kq2m9xza] spare bike pump hangs behind the shed door
//       - [c2hd81mmqa] piano tuned each March by the same tuner
//       - [d9pp20xkcw] recycling goes out Thursday night
//     health (14 items, folded)
//   Between you and Robin:
//     running jokes (2):
//       - [k1n0zz8w2p] "the lasagne incident"
//   and 12 more topics with 85 items: list them with memory.recall topics
//
const foldedTopicLine = '{topic} ({count} items, folded)';

const closingLine =
  'and {topics} more topics with {items} items: list them with memory.recall topics';

// The 2 status lines of the index: the count of index items, and the index's tokens against its
// budget. (open: index status lines)

// What the descriptions of memory.remember and memory.edit say of the labels. The exact wording
// is the builder's.
// - A gist is one line that says what the item is about.
// - A topic is a short name, such as `home` or `work/standups`. Reuse a topic that exists when one
//   fits, and create one without asking when none fits.
// - A trigger phrase is a phrase the person would say when the memory matters. A broad word such
//   as `home` matches almost every turn. An item with no trigger phrase is never pushed.

// The sentence of the review reason `sensitive`: ../memory-gate/02-types.ts, section B. The tool
// result that holds it: section C of that file. No write gets this reason; a stored proposal
// renders it.

// Tool errors with no agreed text: (open: error texts)
// - memory.remember without gist or topic
// - memory.edit with none of text, gist, topic and triggers
// - a label-only memory.edit with quote, eventID, until or subject
// - memory.recall with 2 of query, itemIDs, topic and topics
// - memory.recall with includeRetired, includeHistory or limit beside topic or topics
// - memory.recall with after beside query or itemIDs
// The text of a recall that finds nothing has no agreed wording either. (open: empty recall text)

// ---- Q. Shapes that exist only between 2 slices ----

// Between slice 6 (trigger push) and slice 7 (the similarity push cleanup), these hold beside
// the shapes above. slices/memory-index.md says what the code does in between.
interface TurnMemorySettingsBetween {
  readonly trigger: { readonly items: number; readonly minScore: number };
  readonly similarity: {
    readonly items: number;
    readonly selfNotes: number;
    readonly messages: number;
    readonly minScore: number;
    readonly minSimilarity: number;
  };
}

interface TurnSourcesBetween extends TurnSources {
  readonly readMessageMatches:
    | ((request: MessageRecallRequest) => Promise<readonly PastMessage[]>)
    | null;
}
// PushPick.push is "trigger" | "similarity".
