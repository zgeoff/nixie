import type { Clock } from '@heynixie/clock';
import type { ContentSource } from '@heynixie/log';
import type { RunCheck } from '@heynixie/sessions';
import type { Selectable } from 'kysely';
import type { reviewReasons } from './review-reasons';
import type {
  MemoryChange,
  MemoryOrigin,
  MemorySubject,
  QuoteEvidence,
  VersionRef,
  WriteInTransaction,
} from './types';
import type { WriterGate } from './writer-types';

export type { ContentGateRequest, ContentGateResult } from './content-gate-types';

// The types of the write gate, memory proposals and notices.

// What the write gate reads beside the store: the checker, the clock that proposal lapses read,
// the allow rule lookup, the tuning values, and your configured name or null for "the owner", with
// your pronouns.
export interface GateContext {
  readonly check: RunCheck;
  readonly clock: Pick<Clock, 'now'>;
  readonly findAllowRule: FindAllowRule;
  readonly limits: GateLimits;
  readonly ownerName: string | null;
  readonly ownerPronouns: OwnerPronouns;
}

// Your pronouns as the review sentences read them: the subject, as "they" in "they typed", and the
// possessive, as "their" in "their review".
export interface OwnerPronouns {
  readonly they: string;
  readonly their: string;
}

// The tuning values of the write gate, all configurable.
export interface GateLimits {
  // how many of your latest messages in the thread a quote may come from
  readonly evidenceWindow: number;

  // how long a memory proposal waits for you before it lapses
  readonly proposalLapseMs: number;

  // the most proposals one conversation turn, task run or writer batch may make
  readonly proposalCap: number;

  // the share of a proposal's content words, from 0 to 1, that makes an active item a close match
  readonly closeMatchScore: number;
}

// A rule of yours that names memory.remember or memory.edit and lets a write through that tool skip
// the quote and the checker, as the rule's ID and revision.
export interface AllowRuleMatch {
  readonly ruleID: string;
  readonly revision: number;

  // the write source the rule names, when it names one: image for a remember from a photo of yours
  readonly source?: 'image';
}

// Finds your allow rule on the write's tool that matches a write from the thread, or null. A rule
// on one tool never covers the other, and only a rule that names the image source covers a write
// from a photo. No rule exists until policy ships, so the server's lookup returns null.
export type FindAllowRule = (call: AllowRuleCall) => Promise<AllowRuleMatch | null>;

// The call an allow rule must match: the tool, memory.remember for a new item or memory.edit for a
// change to one, and the thread it came from.
export interface AllowRuleCall {
  readonly tool: 'memory.remember' | 'memory.edit';
  readonly thread: string;

  // image for a remember from a photo of yours, which only a rule that names that source covers
  readonly source?: 'image';
}

// A message you sent, as the gates read it: its record, its text and how each span arrived.
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

// Why a write waits for your review instead of applying.
export type ReviewReason = (typeof reviewReasons)[number];

// Who asked for a write: the conversation or a task in a run, or the memory writer in a batch,
// with the model of the call that asked. nixie sets it from the run, never from the arguments.
export interface WriteCaller {
  readonly origin: 'conversation' | 'task' | 'memory_writer';
  readonly thread: string;
  readonly taskID: string;
  readonly runID: string;
  readonly model: string;

  // the writer batch the write belongs to, which takes the place of the turn for the cap and the
  // notice
  readonly batchID?: string;
}

export interface GatedRememberRequest {
  readonly text: string;
  readonly quote?: string;

  // the sequence of the log record the quote comes from, which takes the place of the recent window
  readonly eventID?: number;
  readonly target?: VersionRef;
  readonly isPinned?: boolean;

  // a new item's subject, owner when unset; an edit keeps the item's own subject
  readonly subject?: MemorySubject;

  // the photo of yours a new item comes from, which never counts as your words
  readonly image?: ImageRef;
  readonly caller: WriteCaller;
}

export interface GatedRetireRequest {
  readonly target: VersionRef;
  readonly intentQuote?: string;
  readonly caller: WriteCaller;
}

// A gated write applied at once, or became a proposal with its review reason, or merged into a
// pending proposal of the same change.
export type WriteOutcome =
  | { readonly status: 'applied'; readonly itemID: string; readonly version: number }
  | {
      readonly status: 'proposed';
      readonly proposalID: string;
      readonly reason: ReviewReason;
      readonly merged: boolean;
    };

// One image of a message of yours, by the message's sequence and the image's number in it, from 1.
export interface ImageRef {
  readonly messageSequence: number;
  readonly image: number;
}

// The model's offer to remember what an image of yours shows, with the text it would save.
export interface ImageOfferRequest {
  readonly image: ImageRef;
  readonly text: string;
  readonly caller: WriteCaller;
}

// Your answer to an offer, as the sequence of your message that answers it.
export interface OfferAnswerRequest {
  readonly image: ImageRef;
  readonly answerSequence: number;
  readonly caller: WriteCaller;
}

// An answer applied the offered text at once, or declined it and wrote nothing.
export type OfferAnswerOutcome =
  | { readonly status: 'applied'; readonly itemID: string; readonly version: number }
  | { readonly status: 'declined' };

// The write paths of the model and the memory writer, each behind its gate.
export interface MemoryWrites {
  readonly remember: (request: GatedRememberRequest) => Promise<WriteOutcome>;
  readonly retire: (request: GatedRetireRequest) => Promise<WriteOutcome>;

  // records the one offer an image takes, and returns the line the model says to you
  readonly offerImage: (request: ImageOfferRequest) => Promise<string>;

  // applies an offered text on your typed yes, and writes nothing on any other answer
  readonly answerOffer: (request: OfferAnswerRequest) => Promise<OfferAnswerOutcome>;

  // the gate each write of a memory writer batch passes before its batch publishes
  readonly batch: WriterGate;
}

// The model's own write paths, which its memory tools call, and the sentence each review reason
// reads as in their results. A writer batch's gate stays out of the model's reach.
export interface ModelWriteStore {
  readonly writes: Pick<MemoryWrites, 'remember' | 'retire' | 'offerImage' | 'answerOffer'>;
  readonly renderReviewReason: (reason: ReviewReason) => string;
}

// A memory proposal as the memory view reads it, with its sealed text opened.
export interface MemoryProposal {
  readonly proposalID: string;
  readonly operation: 'remember' | 'retire';
  readonly itemID: string;
  readonly targetVersion: number | null;
  readonly isPinned: boolean;

  // the subject of the item the proposal creates or changes
  readonly subject: MemorySubject;
  readonly reason: ReviewReason;
  readonly actionHash: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly createdAt: number;
  readonly lapseAt: number;

  // who proposed it, the first proposer then each write that merged into it, oldest first
  readonly sources: readonly ProposalSource[];

  // the proposed text, or the item's text for a retirement, and the quote it cited
  readonly text: string;
  readonly quote: string | null;
  readonly evidence: QuoteEvidence | null;
}

// One write that proposed a change: the proposal's own, or one that merged into it.
export interface ProposalSource {
  readonly origin: MemoryOrigin;
  readonly thread: string | null;
  readonly taskID: string | null;
  readonly model: string | null;
  readonly proposedAt: number;
}

// Your answer to a proposal from the client, bound to the action hash the client showed. An edit
// approves your own text in place of the proposed text.
export interface ProposalAnswer {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly identityID: string;
  readonly editedText?: string;

  // applies a new item's proposal as a revision of this item, such as a close match
  readonly revisionOf?: VersionRef;

  // applies a new item's proposal as a new item even when an active item closely matches it
  readonly ignoreCloseMatch?: boolean;

  // the caller's own write in the approved version's transaction, such as a checked action's result
  readonly writeInTransaction?: WriteInTransaction;
}

// Your rejection of a proposal, with your optional reason, which the conversation reads in its
// next turn.
export interface ProposalRejection {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly identityID: string;
  readonly reason?: string;

  // the caller's own write in the rejection's transaction, such as a checked action's result
  readonly writeInTransaction?: WriteInTransaction;
}

// An approval applied, or held for the active item that closely matches the proposal.
export type ApprovalResult =
  | { readonly status: 'applied'; readonly itemID: string; readonly version: number }
  | { readonly status: 'close_match'; readonly item: CloseMatch };

// An active item whose wording a proposal shares, with the version a revision binds to.
export interface CloseMatch {
  readonly itemID: string;
  readonly version: number;
  readonly text: string;
}

export interface PendingFilter {
  readonly subjects?: readonly MemorySubject[];
}

// The proposals in the memory view, and your answers to them.
export interface MemoryProposals {
  // the pending proposals of the given subjects, or of every subject when unset
  readonly listPending: (filter?: PendingFilter) => Promise<readonly MemoryProposal[]>;
  readonly approve: (answer: ProposalAnswer) => Promise<ApprovalResult>;
  readonly reject: (rejection: ProposalRejection) => Promise<void>;

  // lapses every pending proposal past its lapse time, and returns how many
  readonly lapse: () => Promise<number>;

  // the proposed text of each of the conversation's rejected edits, by proposal ID, for an item no
  // forget has begun
  readonly readRejectedEdits: (
    proposalIDs: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
}

// One entry of a turn's or a batch's notice, with the version an undo binds to.
export interface NoticeEntry {
  readonly itemID: string;
  readonly change: MemoryChange | 'proposed';
  readonly version: number | null;
  readonly proposalID: string | null;
}

// The grouped notice for one turn or batch: "Remembered 3 things", with each entry.
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
  readonly operation: 'remember' | 'retire';
  readonly target_version: number | null;
  readonly is_pinned: number;

  // the reason as the proposal record stores it, which a later release's reason can be
  readonly review_reason: string;
  readonly status: 'pending' | 'consumed' | 'rejected' | 'lapsed';
  readonly action_hash: string;
  readonly sealed: string;
  readonly evidence: string | null;
  readonly origin: MemoryOrigin;
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

  // the kind the release before reads, fact or self, and the subject of the item the proposal
  // creates or changes, null on a row the release before wrote, whose subject its kind gives
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
