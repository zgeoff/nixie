import type { CheckedTables, MemorySubjectCounts } from '@heynixie/db';
import type { ContentSource, Definitions, JSONObject, Log } from '@heynixie/log';
import type { MemoryApproval, PinnedCoreUse } from '@heynixie/sessions';
import type { Selectable, Transaction } from 'kysely';
import type {
  GateContext,
  ImageRef,
  MemoryForgottenEvidenceTable,
  MemoryNoticeEntryTable,
  MemoryProposalTable,
} from './gate-context';
import type { DeliveryLock } from './make-delivery-lock';
import type { RateRequest } from './memory-rating';
import type { ItemHistory, MemoryView } from './memory-view';
import type { MessageRecallRequest, MessageRecallResult } from './message-recall-request';
import type { StoreIndexes } from './start-store-indexes';

export type MemoryState = 'active' | 'retired' | 'forgetting' | 'forgotten';

export type VersionState = 'active' | 'retired';

export type MemorySubject = 'owner' | 'self' | 'shared';

export type MemoryChange = 'created' | 'edited' | 'retired' | 'restored' | 'undone';

export type ProposalOperationKind = 'remember' | 'retire' | 'pin';

export type MemoryOrigin = 'owner' | 'conversation' | 'task' | 'memory_writer' | 'lapse';

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

  readonly isSensitive?: boolean;

  readonly until?: number | null;
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
}

export interface SensitiveRequest {
  readonly itemID: string;
  readonly isSensitive: boolean;
  readonly provenance: Provenance;

  readonly writeInTransaction?: WriteInTransaction;
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

  readonly excludePinned?: boolean;

  readonly excludeSensitive?: boolean;

  readonly excludedVersions?: readonly VersionRef[];

  readonly excludedWords?: readonly string[];

  readonly thread?: string;

  readonly isTurnNote?: boolean;

  readonly selfNoteLimit?: number;

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
}

export interface RecalledItem extends RecalledVersion {
  readonly itemID: string;

  readonly shortID: string;
  readonly isPinned: boolean;

  readonly subject: MemorySubject;

  readonly history?: readonly RecalledVersion[];
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
  readonly recall: (request: RecallRequest) => Promise<RecallResult>;

  readonly recallMessages: (request: MessageRecallRequest) => Promise<MessageRecallResult>;

  readonly removeMessages: (sequences: readonly number[]) => Promise<void>;
  readonly remember: (request: RememberRequest) => Promise<VersionRef>;
  readonly retire: (request: RetireRequest) => Promise<VersionRef>;

  readonly lapse: () => Promise<number>;
  readonly restore: (request: RestoreRequest) => Promise<VersionRef>;
  readonly undo: (request: UndoRequest) => Promise<VersionRef>;
  readonly keep: (request: KeepRequest) => Promise<void>;
  readonly pin: (request: PinRequest) => Promise<void>;
  readonly markSensitive: (request: SensitiveRequest) => Promise<VersionRef>;

  readonly readPinnedCore: () => Promise<readonly RecalledItem[]>;
  readonly readPinnedCoreUse: () => Promise<PinnedCoreUse>;

  readonly forget: (request: ForgetRequest) => Promise<void>;

  readonly forgetRetired: (request: RetiredForgetRequest) => Promise<void>;

  readonly forgetAll: (request: AllForgetRequest) => Promise<readonly string[]>;

  readonly finishForgets: (itemIDs: readonly string[]) => Promise<ForgetStatus>;
  readonly readHistory: (itemID: string) => Promise<ItemHistory | null>;

  readonly readSubjectCounts: () => Promise<MemorySubjectCounts>;

  readonly rate: (request: RateRequest) => Promise<void>;

  readonly view: MemoryView;
}

export interface ItemIDStore {
  readonly readItemIDMap: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;

  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

type CleanupCause = { readonly itemID: string } | { readonly momentID: string };

// The cleanup must be safe to run again, because a forget or a moment destroy that a crash cut
// short runs it again on resume.
export type CleanupSessions = (cause: CleanupCause) => Promise<void>;

export type EncodeKind = 'query' | 'document';

export interface Encoder {
  readonly encode: (texts: readonly string[], kind: EncodeKind) => Promise<readonly Float32Array[]>;
}

export interface SemanticSearch {
  readonly encoder: Encoder;
  readonly onError: (error: unknown) => void;
}

export interface MemoryContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly cleanupSessions: CleanupSessions;
  readonly gate: GateContext;

  readonly pinnedCoreTokens?: number;

  readonly semanticSearch?: SemanticSearch;
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
  readonly is_sensitive: number;
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

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
export type MemoryTables = CheckedTables<
  Readonly<{
    memory_items: MemoryItemTable;
    memory_versions: MemoryVersionTable;
    memory_proposals: MemoryProposalTable;
    memory_proposal_merges: MemoryProposalMergeTable;
    memory_notice_entries: MemoryNoticeEntryTable;
    memory_forgotten_evidence: MemoryForgottenEvidenceTable;
  }>
>;

export type MemoryItemRow = Selectable<MemoryItemTable>;

export type MemoryVersionRow = Selectable<MemoryVersionTable>;
