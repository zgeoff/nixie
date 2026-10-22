import type { CheckedTables, MemorySubjectCounts } from '@heynixie/db';
import type { ContentSource, Definitions, JSONObject, Log } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/sessions';
import type { Selectable, Transaction } from 'kysely';
import type {
  GateContext,
  MemoryForgottenEvidenceTable,
  MemoryNoticeEntryTable,
  MemoryProposalTable,
} from './gate-types';
import type { DeliveryLock } from './make-delivery-lock';
import type { MessageRecallRequest, MessageRecallResult } from './message-recall-types';
import type { RateRequest } from './rating-types';
import type { StoreIndexes } from './start-store-indexes';
import type { ItemHistory, MemoryView } from './view-types';

export type MemoryState = 'active' | 'retired' | 'forgetting' | 'forgotten';

export type VersionState = 'active' | 'retired';

export type MemorySubject = 'owner' | 'self' | 'shared';

export type MemoryChange = 'created' | 'edited' | 'retired' | 'restored' | 'undone';

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

export interface ForgetRequest {
  readonly target: VersionRef;
  readonly provenance: Provenance;
  readonly writeInTransaction?: WriteInTransaction;
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

  readonly excludedVersions?: readonly VersionRef[];

  readonly excludedWords?: readonly string[];

  readonly thread?: string;

  readonly isTurnNote?: boolean;

  readonly selfNoteLimit?: number;

  readonly subjects?: readonly MemorySubject[];
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

export interface RecallResult {
  readonly items: readonly RecalledItem[];

  readonly next: string | null;

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

  readonly readPinnedCore: () => Promise<readonly RecalledItem[]>;

  readonly forget: (request: ForgetRequest) => Promise<void>;

  readonly finishForget: (itemID: string) => Promise<void>;
  readonly readHistory: (itemID: string) => Promise<ItemHistory | null>;

  readonly readSubjectCounts: () => Promise<MemorySubjectCounts>;

  readonly rate: (request: RateRequest) => Promise<void>;

  readonly view: MemoryView;
}

export interface ItemIDStore {
  readonly readItemIDMap: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;

  readonly readShortIDs: (itemIDs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

interface ForgottenItem {
  readonly itemID: string;
}

// The cleanup must be safe to run again, because a forget that a crash cut short runs it again on
// resume.
export type CleanupSessions = (cause: ForgottenItem) => Promise<void>;

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
