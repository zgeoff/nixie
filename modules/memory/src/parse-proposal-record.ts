import type { ContentSource, EnvelopeRecord, JSONObject } from '@heynixie/log';
import { z } from 'zod';
import type { ReviewReason } from './gate-types';
import type { MemoryOrigin, QuoteEvidence } from './types';

const reviewReasons = [
  'no_quote',
  'quote_not_typed',
  'quote_in_quoted_block',
  'invisible_character',
  'token_missing',
  'checker_not_asserted',
  'checker_unsure',
  'checker_unreachable',
  'forgotten_evidence',
  'ambiguous_target',
  'pinned',
] as const satisfies readonly ReviewReason[];

const proposed = z.strictObject({
  proposalID: z.string(),
  itemID: z.string(),
  isNewItem: z.boolean(),
  operation: z.enum(['remember', 'retire']),
  targetVersion: z.int().min(1).nullable(),
  isPinned: z.boolean(),
  reviewReason: z.enum(reviewReasons),
  actionHash: z.string(),
  sealed: z.base64(),
  evidence: z.strictObject({ recordSequence: z.int(), start: z.int(), end: z.int() }).nullable(),
  origin: z.enum(['owner', 'conversation', 'task', 'memory_writer']),
  source: z.enum(['owner', 'owner_data', 'untrusted']),
  taskID: z.string().nullable(),
  capGroup: z.string(),
  checks: z.record(z.string(), z.json()).nullable(),
  model: z.string().nullable(),
  noticeKey: z.string().nullable(),
  lapseAt: z.int(),
});

const approvalRecorded = z.strictObject({
  proposalID: z.string(),
  approvalID: z.string(),
  actionHash: z.string(),
  answer: z.enum(['approved', 'edited']),
  identityID: z.string(),
});

const resolved = z.strictObject({ proposalID: z.string() });

const merged = z.strictObject({
  mergeID: z.string(),
  proposalID: z.string(),
  itemID: z.string(),
  origin: z.enum(['owner', 'conversation', 'task', 'memory_writer']),
  taskID: z.string().nullable(),
  model: z.string().nullable(),
  noticeKey: z.string().nullable(),
});

interface ProposedRecord {
  readonly kind: 'memory.proposed';
  readonly proposalID: string;
  readonly itemID: string;
  readonly isNewItem: boolean;
  readonly operation: 'remember' | 'retire';
  readonly targetVersion: number | null;
  readonly isPinned: boolean;
  readonly reviewReason: ReviewReason;
  readonly actionHash: string;
  readonly sealed: string;
  readonly evidence: QuoteEvidence | null;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly taskID: string | null;
  readonly capGroup: string;
  readonly checks: JSONObject | null;
  readonly model: string | null;
  readonly noticeKey: string | null;

  // when the proposal lapses, in milliseconds since the epoch
  readonly lapseAt: number;
}

// A later write that proposed the same change as a pending proposal, and merged into it.
interface MergedRecord {
  readonly kind: 'memory.proposal_merged';
  readonly mergeID: string;
  readonly proposalID: string;
  readonly itemID: string;
  readonly origin: MemoryOrigin;
  readonly taskID: string | null;
  readonly model: string | null;
  readonly noticeKey: string | null;
}

// The records that change a memory proposal: its creation, a later write that merged into it, your
// approval, your rejection, and its lapse.
export type ProposalRecord =
  | ProposedRecord
  | MergedRecord
  | {
      readonly kind: 'memory.approval_recorded';
      readonly proposalID: string;
      readonly approvalID: string;
      readonly actionHash: string;
      readonly answer: 'approved' | 'edited';
      readonly identityID: string;
    }
  | { readonly kind: 'memory.proposal_rejected'; readonly proposalID: string }
  | { readonly kind: 'memory.proposal_lapsed'; readonly proposalID: string };

// Reads a proposal record's payload into its typed shape, or null for a record of another kind. A
// proposal record whose payload breaks its shape throws, so a fold never writes a half-read row.
export function parseProposalRecord(record: EnvelopeRecord): ProposalRecord | null {
  if (record.kind === 'memory.proposed') {
    return { kind: record.kind, ...proposed.parse(record.payload) };
  }
  if (record.kind === 'memory.proposal_merged') {
    return { kind: record.kind, ...merged.parse(record.payload) };
  }
  if (record.kind === 'memory.approval_recorded') {
    return { kind: record.kind, ...approvalRecorded.parse(record.payload) };
  }
  if (record.kind === 'memory.proposal_rejected' || record.kind === 'memory.proposal_lapsed') {
    return { kind: record.kind, ...resolved.parse(record.payload) };
  }
  return null;
}
