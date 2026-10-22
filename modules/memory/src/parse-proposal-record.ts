import type { ContentSource, EnvelopeRecord, JSONObject } from '@heynixie/log';
import { z } from 'zod';
import type { ProposalOrigin, QuoteEvidence } from './types';

const proposed = z.strictObject({
  proposalID: z.string(),
  itemID: z.string(),
  isNewItem: z.boolean(),
  operation: z.enum(['remember', 'retire']),
  targetVersion: z.int().min(1).nullable(),
  isPinned: z.boolean(),

  // A later release can add a review reason, and a rollback leaves its records in the log, so the
  // record keeps any reason word for word.
  reviewReason: z.string(),
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
  lapseAt: z.int(),
});

interface ProposedRecord {
  readonly kind: 'memory.proposed';
  readonly proposalID: string;
  readonly itemID: string;
  readonly isNewItem: boolean;
  readonly operation: 'remember' | 'retire';
  readonly targetVersion: number | null;
  readonly isPinned: boolean;

  readonly reviewReason: string;
  readonly actionHash: string;
  readonly sealed: string;
  readonly evidence: QuoteEvidence | null;
  readonly origin: ProposalOrigin;
  readonly source: ContentSource;
  readonly taskID: string | null;
  readonly capGroup: string;
  readonly checks: JSONObject | null;
  readonly model: string | null;
  readonly noticeKey: string | null;

  readonly lapseAt: number;
}

interface MergedRecord {
  readonly kind: 'memory.proposal_merged';
  readonly mergeID: string;
  readonly proposalID: string;
  readonly itemID: string;
  readonly origin: ProposalOrigin;
  readonly taskID: string | null;
  readonly model: string | null;
  readonly noticeKey: string | null;

  readonly lapseAt: number;
}

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
