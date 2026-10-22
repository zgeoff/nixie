import type { Clock } from '@heynixie/clock';
import type { ContentSource } from '@heynixie/log';
import type { RunCheck } from '@heynixie/sessions';
import type { Selectable } from 'kysely';
import type { reviewReasons } from './review-reasons';
import type {
  MemoryChange,
  MemorySubject,
  ProposalOperationKind,
  ProposalOrigin,
  QuoteEvidence,
  VersionRef,
  WriteInTransaction,
} from './types';
import type { WriterGate } from './writer-types';

export type { ContentGateRequest, ContentGateResult } from './content-gate-types';

export interface GateContext {
  readonly check: RunCheck;
  readonly clock: Pick<Clock, 'now'>;
  readonly findAllowRule: FindAllowRule;
  readonly limits: GateLimits;
  readonly ownerName: string | null;
  readonly ownerPronouns: OwnerPronouns;
}

export interface OwnerPronouns {
  readonly they: string;
  readonly their: string;
}

export interface GateLimits {
  readonly evidenceWindow: number;

  readonly proposalLapseMs: number;

  readonly proposalCap: number;

  readonly closeMatchScore: number;
}

export interface AllowRuleMatch {
  readonly ruleID: string;
  readonly revision: number;

  readonly source?: 'image';
}

export type FindAllowRule = (call: AllowRuleCall) => Promise<AllowRuleMatch | null>;

export interface AllowRuleCall {
  readonly tool: 'memory.remember' | 'memory.edit' | 'memory.pin';
  readonly thread: string;

  readonly source?: 'image';
}

export interface OwnerMessage {
  readonly sequence: number;
  readonly text: string;
  readonly spans: readonly MessageSpan[];
}

export interface MessageSpan {
  readonly start: number;
  readonly end: number;
  readonly source: 'typed' | 'pasted' | 'dropped' | 'unknown';
}

export type ReviewReason = (typeof reviewReasons)[number];

export interface WriteCaller {
  readonly origin: 'conversation' | 'task' | 'memory_writer';
  readonly thread: string;
  readonly taskID: string;
  readonly runID: string;
  readonly model: string;

  readonly batchID?: string;
}

export interface GatedRememberRequest {
  readonly text: string;
  readonly quote?: string;

  readonly eventID?: number;
  readonly target?: VersionRef;
  readonly isPinned?: boolean;

  readonly subject?: MemorySubject;

  readonly image?: ImageRef;
  readonly caller: WriteCaller;
}

export interface GatedRetireRequest {
  readonly target: VersionRef;
  readonly intentQuote?: string;
  readonly caller: WriteCaller;
}

export interface GatedPinRequest {
  readonly target: VersionRef;
  readonly caller: WriteCaller;
}

export type WriteOutcome =
  | { readonly status: 'applied'; readonly itemID: string; readonly version: number }
  | {
      readonly status: 'proposed';
      readonly proposalID: string;
      readonly reason: ReviewReason;
      readonly merged: boolean;
    };

export interface ImageRef {
  readonly messageSequence: number;
  readonly image: number;
}

export interface MemoryWrites {
  readonly remember: (request: GatedRememberRequest) => Promise<WriteOutcome>;
  readonly retire: (request: GatedRetireRequest) => Promise<WriteOutcome>;
  readonly pin: (request: GatedPinRequest) => Promise<WriteOutcome>;

  readonly batch: WriterGate;
}

export interface ModelWriteStore {
  readonly writes: Pick<MemoryWrites, 'remember' | 'retire'>;
  readonly renderReviewReason: (reason: ReviewReason) => string;
}

export interface MemoryProposal {
  readonly proposalID: string;
  readonly operation: ProposalOperationKind;
  readonly itemID: string;
  readonly targetVersion: number | null;
  readonly isPinned: boolean;

  readonly subject: MemorySubject;
  readonly reason: ReviewReason;
  readonly actionHash: string;
  readonly origin: ProposalOrigin;
  readonly source: ContentSource;
  readonly createdAt: number;
  readonly lapseAt: number;

  readonly sources: readonly ProposalSource[];

  readonly text: string;
  readonly quote: string | null;
  readonly evidence: QuoteEvidence | null;

  readonly image: ProposalImage | null;
}

export interface ProposalImage extends ImageRef {
  readonly thread: string;
}

export interface ProposalSource {
  readonly origin: ProposalOrigin;
  readonly thread: string | null;
  readonly taskID: string | null;
  readonly model: string | null;
  readonly proposedAt: number;
}

export interface ProposalAnswer {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly identityID: string;
  readonly editedText?: string;

  readonly revisionOf?: VersionRef;

  readonly ignoreCloseMatch?: boolean;

  readonly writeInTransaction?: WriteInTransaction;
}

export interface ProposalRejection {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly identityID: string;
  readonly reason?: string;

  readonly writeInTransaction?: WriteInTransaction;
}

export type ApprovalResult =
  | { readonly status: 'applied'; readonly itemID: string; readonly version: number }
  | { readonly status: 'close_match'; readonly item: CloseMatch };

export interface CloseMatch {
  readonly itemID: string;
  readonly version: number;
  readonly text: string;
}

export interface PendingFilter {
  readonly subjects?: readonly MemorySubject[];
}

export interface MemoryProposals {
  readonly listPending: (filter?: PendingFilter) => Promise<readonly MemoryProposal[]>;
  readonly approve: (answer: ProposalAnswer) => Promise<ApprovalResult>;
  readonly reject: (rejection: ProposalRejection) => Promise<void>;

  readonly lapse: () => Promise<number>;

  readonly readRejectedEdits: (
    proposalIDs: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
}

export interface NoticeEntry {
  readonly itemID: string;
  readonly change: MemoryChange | 'proposed';
  readonly version: number | null;
  readonly proposalID: string | null;
  readonly sequence: number;
}

export interface MemoryNotice {
  readonly noticeKey: string;
  readonly thread: string | null;
  readonly remembered: number;
  readonly retired: number;
  readonly proposed: number;
  readonly entries: readonly NoticeEntry[];
}

export interface MemoryProposalTable {
  readonly proposal_id: string;
  readonly item_id: string;
  readonly is_new_item: number;
  readonly operation: ProposalOperationKind;
  readonly target_version: number | null;
  readonly is_pinned: number;

  readonly review_reason: string;
  readonly status: 'pending' | 'consumed' | 'rejected' | 'lapsed';
  readonly action_hash: string;
  readonly sealed: string;
  readonly evidence: string | null;
  readonly origin: ProposalOrigin;
  readonly source: ContentSource;
  readonly task_id: string | null;
  readonly thread: string | null;
  readonly cap_group: string;
  readonly checks: string | null;
  readonly model: string | null;
  readonly notice_key: string | null;
  readonly created_sequence: number;
  readonly created_at: number;
  readonly lapse_at: number;
  readonly resolved_sequence: number | null;

  readonly kind: 'fact' | 'self';
  readonly subject: MemorySubject | null;
}

export interface MemoryNoticeEntryTable {
  readonly entry_key: string;
  readonly notice_key: string;
  readonly thread: string | null;
  readonly item_id: string;
  readonly version: number | null;
  readonly change: MemoryChange | 'proposed';
  readonly proposal_id: string | null;
  readonly sequence: number;
  readonly recorded_at: number;
}

export interface MemoryForgottenEvidenceTable {
  readonly evidence_key: string;
  readonly record_sequence: number;
  readonly item_id: string;
}

export type MemoryProposalRow = Selectable<MemoryProposalTable>;
