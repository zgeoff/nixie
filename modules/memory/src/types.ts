import type { CheckedTables, MemorySubjectCounts } from '@heynixie/db';
import type { ContentSource, Definitions, ErasureRegistry, JSONObject, Log } from '@heynixie/log';
import type {
  MemoryApproval,
  PinnedCoreUse,
  SessionIndex,
  TurnMemory,
  TurnMemoryAsk,
} from '@heynixie/sessions';
import type { Selectable, Transaction } from 'kysely';
import type {
  GateContext,
  ImageRef,
  MemoryChangeNoticeTable,
  MemoryForgottenEvidenceTable,
  MemoryNoticeEntryTable,
  MemoryProposalTable,
} from './gate/gate-context';
import type { TopicCount } from './index-block/collect-topic-counts';
import type { IndexLine } from './index-block/collect-topic-lines';
import type { MemoryIndexConfig } from './index-block/default-index-settings';
import type { EntryPage, TopicRequest } from './index-block/types';
import type { StoreIndexes } from './moment/store/start-store-indexes';
import type { RelatedItem } from './related/read-related-items';
import type { TurnMemorySettings } from './turn/types';
import type { UsageListEntry } from './usage/collect-usage-list';
import type { UsageListRequest } from './usage/read-usage-list';
import type { MemoryUsage } from './usage/types';
import type { DeliveryLock } from './utils/make-delivery-lock';
import type { ItemHistory, MemoryView } from './view/memory-view';

export type MemoryState = 'active' | 'retired' | 'forgetting' | 'forgotten';

export type VersionState = 'active' | 'retired';

export type MemorySubject = 'owner' | 'self' | 'shared';

export type MemoryChange = 'created' | 'edited' | 'retired' | 'restored' | 'undone';

// What a notice entry reports: a version's change, a proposal, or a write of no text version.
export type NoticeChange = MemoryChange | 'proposed' | 'labelled' | 'pinned' | 'unpinned';

export type ProposalOperationKind = 'remember' | 'retire' | 'pin';

export type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'lapse';

export type LabelChange = 'written' | 'edited' | 'backfilled';

export type LabelOrigin = MemoryOrigin | 'migration';

export interface Labels {
  readonly gist: string;
  readonly topic: string;
  readonly triggers: readonly string[];
}

export type ProposalOrigin = Exclude<MemoryOrigin, 'lapse'>;

export interface QuoteEvidence {
  readonly recordSequence: number;
  readonly start: number;
  readonly end: number;
}

export interface Provenance {
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;

  readonly taskID: string | null;

  readonly proposalID: string | null;

  readonly checks: JSONObject | null;

  readonly thread?: string;

  readonly model?: string | null;
}

export interface VersionText {
  readonly text: string;
  readonly evidenceQuote: string | null;
  readonly intentQuote: string | null;
}

export interface RememberRequest {
  readonly text: string;
  readonly provenance: Provenance;

  readonly target?: VersionRef;
  readonly evidenceQuote?: string;
  readonly evidence?: QuoteEvidence;
  readonly isPinned?: boolean;

  readonly subject?: MemorySubject;

  readonly until?: number | null;

  readonly labels?: Labels;
}

export type WriteInTransaction = (tx: Transaction<unknown>) => Promise<void>;

export interface RetireRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction;

  readonly intentQuote?: string;
  readonly intentEvidence?: QuoteEvidence;
}

export interface RestoreRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction;
}

export interface UndoRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction;
}

export interface KeepRequest {
  readonly target: VersionRef;
  readonly writeInTransaction: WriteInTransaction;
}

export interface PinRequest {
  readonly itemID: string;
  readonly isPinned: boolean;
  readonly provenance: Provenance;

  readonly version?: number;
  readonly writeInTransaction?: WriteInTransaction;

  // the notice that the write joins, for a write the user learns of from a notice
  readonly noticeKey?: string;
}

export interface ForgetRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction;
}

export interface RetiredForgetRequest {
  readonly targets: readonly VersionRef[];
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction;
}

export interface AllForgetRequest {
  readonly provenance: Provenance;
}

export interface ForgetStatus {
  readonly deleted: readonly string[];
  readonly pending: readonly string[];
  readonly forgottenSequence: number | null;
}

export interface VersionRef {
  readonly itemID: string;
  readonly version: number;
}

export interface RecallRequest {
  readonly query?: string;
  readonly itemIDs?: readonly string[];

  readonly versions?: readonly VersionRef[];
  readonly limit?: number;

  readonly after?: string;
  readonly includeRetired?: boolean;
  readonly includeHistory?: boolean;

  readonly minScore?: number;

  readonly minSimilarity?: number;

  readonly excludedWords?: readonly string[];

  readonly thread?: string;

  readonly isTurnNote?: boolean;

  readonly subjects?: readonly MemorySubject[];

  // The most UTF-8 bytes the items of the result may take, with a comma between items. Without
  // it, the recall cuts nothing.
  readonly byteBudget?: number;

  // The UTF-8 bytes of one item as the caller returns it.
  readonly measureItem?: (item: RecalledItem) => Promise<number>;
}

export interface RecalledVersion {
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly recordedAt: number;
  readonly text: string;

  readonly evidenceQuote: string | null;

  readonly image: ImageRef | null;

  readonly model: string | null;

  readonly approval: MemoryApproval | null;

  // a version a purge wrote: its stored change and origin are not the owner's edit
  readonly isBridge: boolean;
}

export interface RecalledItem extends RecalledVersion {
  readonly itemID: string;

  readonly shortID: string;
  readonly isPinned: boolean;

  readonly subject: MemorySubject;

  // the text version plus the approved label edits, which the tools show as `version`
  readonly revision: number;

  readonly gist: string;
  readonly topic: string;
  readonly triggers: readonly string[];

  // set only above 0
  readonly disputedBy?: number;
  readonly supersededBy?: number;

  readonly history?: readonly RecalledVersion[];

  readonly labelHistory?: readonly LabelRevision[];
}

export interface LabelRevision extends Labels {
  readonly revision: number;
}

export type SearchMode = 'hybrid' | 'keyword' | 'keyword-fallback';

interface OmittedItem {
  readonly itemID: string;
  readonly shortID: string;
}

export interface RecallOmitted {
  // The items the result leaves out, in the order named or ranked. The plain list names none.
  readonly items: readonly OmittedItem[];

  // The entries the result leaves out: the named items for a query or IDs, the cut items of the
  // page for the plain list.
  readonly count: number;

  // The history versions of an oversized first item that the result leaves out.
  readonly versions: number;
}

export interface RecallResult {
  readonly items: readonly RecalledItem[];

  readonly next: string | null;

  readonly omitted: RecallOmitted;

  readonly searchMode?: SearchMode;
}

export interface MemoryStore {
  readonly readTurnMemory: (ask: TurnMemoryAsk) => Promise<TurnMemory>;

  readonly recall: (request: RecallRequest) => Promise<RecallResult>;

  readonly remember: (request: RememberRequest) => Promise<VersionRef>;
  readonly retire: (request: RetireRequest) => Promise<VersionRef>;

  readonly lapse: () => Promise<number>;
  readonly restore: (request: RestoreRequest) => Promise<VersionRef>;
  readonly undo: (request: UndoRequest) => Promise<VersionRef>;
  readonly keep: (request: KeepRequest) => Promise<void>;
  readonly pin: (request: PinRequest) => Promise<void>;

  readonly readPinnedCore: () => Promise<readonly RecalledItem[]>;
  readonly readPinnedCoreUse: () => Promise<PinnedCoreUse>;

  readonly readIndex: () => Promise<SessionIndex>;

  readonly readTopicLines: (
    request: TopicRequest & { readonly topic: string },
  ) => Promise<EntryPage<IndexLine>>;

  readonly readTopicCounts: (request: TopicRequest) => Promise<EntryPage<TopicCount>>;

  readonly forget: (request: ForgetRequest) => Promise<void>;

  readonly forgetRetired: (request: RetiredForgetRequest) => Promise<void>;

  readonly forgetAll: (request: AllForgetRequest) => Promise<readonly string[]>;

  readonly finishForgets: (itemIDs: readonly string[]) => Promise<ForgetStatus>;

  // Purges the evidence of one item of a purge set. Skipped: the item is forgetting or forgotten,
  // or its purge is done.
  readonly purgeItemEvidence: (request: PurgeRequest) => Promise<'purged' | 'skipped'>;

  readonly finishEvidencePurges: (scope: PurgeScope) => Promise<void>;
  readonly readHistory: (itemID: string) => Promise<ItemHistory | null>;

  readonly readSubjectCounts: () => Promise<MemorySubjectCounts>;

  // Each read of usage counts only the records before the sequence.
  readonly readUsage: (beforeSequence: number) => Promise<MemoryUsage>;

  readonly readSavedTimes: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, number>>;
  readonly readUsageList: (request: UsageListRequest) => Promise<readonly UsageListEntry[]>;

  // The active items closest to a text, for a tool that shows what memory holds on its call.
  readonly readRelated: (text: string) => Promise<readonly RelatedItem[]>;

  readonly view: MemoryView;
}

export interface PurgeRequest {
  readonly recordSequence: number;
  readonly itemID: string;
}

// The purges of one forgotten record, or the purges that no record forget owns
export type PurgeScope = { readonly recordSequence: number } | { readonly isUnowned: true };

export interface ItemIDStore {
  readonly readItemIDMap: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;

  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

// How many active notes dispute or supersede an item. The notebook module counts them, and memory
// learns nothing else about a note.
export interface ItemLinkCount {
  readonly disputedBy: number;
  readonly supersededBy: number;
}

export interface ItemLinkCounts {
  // memory passes item UUIDs, the form links store
  readonly readCounts: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, ItemLinkCount>>;
}

export type EncodeKind = 'query' | 'document';

export interface Encoder {
  readonly encode: (texts: readonly string[], kind: EncodeKind) => Promise<readonly Float32Array[]>;

  // An encoder that reads only the start of a long text splits a stored text into chunks it reads
  // whole. The index keeps a vector per chunk and scores an item by its best chunk.
  readonly splitText?: (text: string) => readonly string[];
}

export interface SemanticSearch {
  readonly encoder: Encoder;
  readonly onError: (error: unknown) => void;
}

export interface MemoryContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly gate: GateContext;

  // where the items and the moments register their erasables, which the server's runner takes
  // forgets through; without it neither can be forgotten
  readonly erasure?: ErasureRegistry;

  readonly pinnedCoreTokens?: number;

  readonly index?: MemoryIndexConfig;

  readonly semanticSearch?: SemanticSearch;

  // Without it, no item shows a count of the notes that dispute or supersede it.
  readonly linkCounts?: ItemLinkCounts;

  // What a turn brings. Without it, trigger push runs on its config defaults and no similarity
  // limit is above 0.
  readonly turn?: TurnMemorySettings;
}

export interface StoreParts extends StoreIndexes {
  readonly context: MemoryContext;
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

  readonly short_id: string | null;

  readonly kind: 'fact' | 'self';
  readonly subject: MemorySubject | null;
  readonly until: number | null;
  readonly label_edits: number;
}

interface MemoryLabelTable {
  readonly item_id: string;
  readonly revision: number;
  readonly version: number;
  readonly change: LabelChange;
  readonly sealed: string;
  readonly origin: LabelOrigin;
  readonly source: ContentSource;
  readonly task_id: string | null;
  readonly proposal_id: string | null;
  readonly model: string | null;
  readonly sequence: number;
  readonly recorded_at: number;
}

interface MemoryVersionTable {
  readonly version_key: string;
  readonly item_id: string;
  readonly version: number;
  readonly change: MemoryChange;
  readonly state: VersionState;

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
  readonly until: number | null;
  readonly previous_subject: MemorySubject | null;
}

interface MemoryProposalMergeTable {
  readonly merge_id: string;
  readonly proposal_id: string;
  readonly origin: ProposalOrigin;
  readonly task_id: string | null;
  readonly thread: string | null;
  readonly model: string | null;
  readonly sequence: number;
  readonly recorded_at: number;
}

interface MemoryItemKeyTable {
  readonly key_id: string;
  readonly item_id: string;
  readonly kind: 'generation' | 'version';
  readonly version: number | null;
  readonly sealed_evidence_quote: string | null;
  readonly sealed_intent_quote: string | null;
  readonly from_sequence: number;
  readonly removed_sequence: number | null;
}

interface MemoryEvidencePurgeTable {
  readonly purge_key: string;
  readonly record_sequence: number;
  readonly item_id: string;
  readonly closed_sequence: number | null;
  readonly purged_sequence: number | null;
  readonly bridge_version: number | null;
  readonly labels_revision: number | null;
}

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
export type MemoryTables = CheckedTables<
  Readonly<{
    memory_items: MemoryItemTable;
    memory_versions: MemoryVersionTable;
    memory_labels: MemoryLabelTable;
    memory_proposals: MemoryProposalTable;
    memory_proposal_merges: MemoryProposalMergeTable;
    memory_notice_entries: MemoryNoticeEntryTable;
    memory_change_notices: MemoryChangeNoticeTable;
    memory_forgotten_evidence: MemoryForgottenEvidenceTable;
    memory_item_keys: MemoryItemKeyTable;
    memory_evidence_purges: MemoryEvidencePurgeTable;
  }>
>;

export type MemoryItemRow = Selectable<MemoryItemTable>;

export type MemoryVersionRow = Selectable<MemoryVersionTable>;

export type MemoryLabelRow = Selectable<MemoryLabelTable>;
