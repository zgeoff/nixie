import type { ContentSource, Definitions, JSONObject, Log } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/models';
import type { Selectable } from 'kysely';
import type {
  GateContext,
  MemoryForgottenEvidenceTable,
  MemoryNoticeEntryTable,
  MemoryProposalTable,
} from './gate-types';
import type { ItemHistory } from './history-types';
import type { DeliveryLock } from './make-delivery-lock';
import type { RateRequest } from './rating-types';
import type { MemoryIndex } from './start-memory-index';

// Active items reach retrieval and recall. A retired item stays readable with its history. A
// forgetting item has a forget under way, and a forgotten one has lost its key for good.
export type MemoryState = 'active' | 'retired' | 'forgetting' | 'forgotten';

// The state a version gives its item. A forget adds no version, so a version is never forgetting
// or forgotten.
export type VersionState = 'active' | 'retired';

export type MemoryChange = 'created' | 'edited' | 'retired' | 'restored' | 'undone';

// Who wrote a version: you in the client, the conversation, a task, or the batched memory writer.
export type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'memory_writer';

// Where a quote sits: the sequence of the message record and the quote's offsets in its text.
export interface QuoteEvidence {
  readonly recordSequence: number;
  readonly start: number;
  readonly end: number;
}

// The provenance of a version, which nixie sets from the turn that wrote it and never from the
// model's arguments.
export interface Provenance {
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;

  // the task whose step wrote the version, or null for your own action
  readonly taskID: string | null;

  // the proposal that created the version, or null when it applied at once
  readonly proposalID: string | null;

  // the verdict of each write check, or null before the checks run
  readonly checks: JSONObject | null;

  // the thread the version's record belongs to
  readonly thread?: string;

  // the model ID of the call that wrote the version, or null for your own action
  readonly model?: string | null;
}

// The free text of a version, which nixie seals under the item's key.
export interface VersionText {
  readonly text: string;
  readonly evidenceQuote: string | null;
  readonly intentQuote: string | null;
}

export interface RememberRequest {
  readonly text: string;
  readonly provenance: Provenance;

  // the item to edit and the version the caller read, or neither for a new item
  readonly target?: VersionRef;
  readonly evidenceQuote?: string;
  readonly evidence?: QuoteEvidence;
  readonly isPinned?: boolean;
}

export interface RetireRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;

  // your request to retire the item, when one exists
  readonly intentQuote?: string;
  readonly intentEvidence?: QuoteEvidence;
}

export interface RestoreRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
}

// Undoes the change that made target.version, which must still be the item's current version.
export interface UndoRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
}

export interface PinRequest {
  readonly itemID: string;
  readonly isPinned: boolean;
  readonly provenance: Provenance;
}

export interface ForgetRequest {
  // the item and the version the confirmation showed
  readonly target: VersionRef;
  readonly provenance: Provenance;
}

export interface VersionRef {
  readonly itemID: string;
  readonly version: number;
}

// A query, a list of item IDs, items at named versions, or none, which lists every active item
// a page at a time.
export interface RecallRequest {
  readonly query?: string;
  readonly itemIDs?: readonly string[];

  // items at named versions: each item is delivered only while its current version is the one named
  readonly versions?: readonly VersionRef[];
  readonly limit?: number;

  // the cursor a page returned as next
  readonly after?: string;
  readonly includeRetired?: boolean;
  readonly includeHistory?: boolean;

  // with a query, the lowest score a match keeps; 0 keeps every match
  readonly minScore?: number;

  // leaves out pinned items, which the session's opening already holds
  readonly excludePinned?: boolean;

  // with a query, leaves out an item whose current version is listed, which the reader already
  // holds, so a newer version still matches
  readonly excludedVersions?: readonly VersionRef[];

  // with a query, leaves out each query word that stems the same as a word of one of these, such
  // as a name that nearly every item holds
  readonly excludedWords?: readonly string[];

  // the thread the recall record belongs to
  readonly thread?: string;
}

export interface RecalledVersion {
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly recordedAt: number;
  readonly text: string;

  // the quote the text was saved from, which a retirement carries over, or null for none
  readonly evidenceQuote: string | null;

  // the model ID of the call that wrote the version, or null for your own action
  readonly model: string | null;

  // your approval of the proposal or change the version came from, or null when it applied at once
  readonly approval: MemoryApproval | null;
}

export interface RecalledItem extends RecalledVersion {
  readonly itemID: string;

  // the ID the model reads and passes back in place of itemID
  readonly shortID: string;
  readonly isPinned: boolean;

  // every version, oldest first, when the request asked for history
  readonly history?: readonly RecalledVersion[];
}

export interface RecallResult {
  readonly items: readonly RecalledItem[];

  // the cursor for the next page of a listing, or null on the last page and for a query
  readonly next: string | null;
}

// The one interface the model's tools and the client reach memory through.
export interface MemoryStore {
  readonly recall: (request: RecallRequest) => Promise<RecallResult>;
  readonly remember: (request: RememberRequest) => Promise<VersionRef>;
  readonly retire: (request: RetireRequest) => Promise<VersionRef>;
  readonly restore: (request: RestoreRequest) => Promise<VersionRef>;
  readonly undo: (request: UndoRequest) => Promise<VersionRef>;
  readonly pin: (request: PinRequest) => Promise<void>;

  // every pinned active item, in pin order, for a new session's opening and the change note
  readonly readPinnedCore: () => Promise<readonly RecalledItem[]>;

  // completes once the key is gone, the index entries are removed and the sessions are cleaned up
  readonly forget: (request: ForgetRequest) => Promise<void>;
  readonly readHistory: (itemID: string) => Promise<ItemHistory | null>;

  // keeps the model's ratings of what the thread's latest recall delivered; changes no item
  readonly rate: (request: RateRequest) => Promise<void>;
}

// What a model's memory tool reaches to turn the short IDs the model reads into item IDs and back.
export interface ItemIDStore {
  // the item ID each ID names, by the ID given, whether a short ID or an item ID; an ID that names
  // no item is left out
  readonly findItemIDs: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;

  // the short ID of each item that exists, by item ID
  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

// The session cleanup a forget runs for every live session, which memory in context supplies. It
// must be safe to run again, because a forget that a crash cut short runs it again on resume.
export type CleanupSessions = (itemID: string) => Promise<void>;

export interface MemoryContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly cleanupSessions: CleanupSessions;
  readonly gate: GateContext;

  // the pinned core's budget in tokens, 2,000 when unset
  readonly pinnedCoreTokens?: number;
}

// What every store operation reaches: the context, the index and the delivery lock.
export interface StoreParts {
  readonly context: MemoryContext;
  readonly index: MemoryIndex;
  readonly lock: DeliveryLock;
}

interface MemoryItemTable {
  readonly item_id: string;
  readonly version: number;
  readonly state: MemoryState;
  readonly is_pinned: number;
  readonly pinned_sequence: number | null;
  readonly created_sequence: number;
  readonly updated_sequence: number;
  readonly forgotten_sequence: number | null;

  // the ID the model reads in place of item_id; null only for an item a release before short IDs
  // made after the backfill, whose short ID its UUID gives
  readonly short_id: string | null;
}

interface MemoryVersionTable {
  readonly version_key: string;
  readonly item_id: string;
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;

  // base64 of the sealed VersionText
  readonly sealed: string;
  readonly evidence: string | null;
  readonly intent_evidence: string | null;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly task_id: string | null;
  readonly proposal_id: string | null;
  readonly checks: string | null;
  readonly model: string | null;
  readonly sequence: number;
  readonly snapshot_hash: string;
  readonly recorded_at: number;
}

interface MemoryProposalMergeTable {
  readonly merge_id: string;
  readonly proposal_id: string;
  readonly origin: MemoryOrigin;
  readonly task_id: string | null;
  readonly thread: string | null;
  readonly model: string | null;
  readonly sequence: number;
  readonly recorded_at: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type MemoryTables = Readonly<{
  memory_items: MemoryItemTable;
  memory_versions: MemoryVersionTable;
  memory_proposals: MemoryProposalTable;
  memory_proposal_merges: MemoryProposalMergeTable;
  memory_notice_entries: MemoryNoticeEntryTable;
  memory_forgotten_evidence: MemoryForgottenEvidenceTable;
}>;

export type MemoryItemRow = Selectable<MemoryItemTable>;

export type MemoryVersionRow = Selectable<MemoryVersionTable>;
