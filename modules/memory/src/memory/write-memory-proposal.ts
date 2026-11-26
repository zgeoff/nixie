import type { JSONObject } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildProposeDeps, proposeInTransaction, readProposal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { requireUnforgottenQuote } from '../evidence/require-unforgotten-quote';
import type { ReviewReason, WriteCaller } from '../gate/gate-context';
import { createSealedProposal } from '../proposal/create-sealed-proposal';
import { readMatchingProposal } from '../proposal/read-matching-proposal';
import type { PendingProposal } from '../proposal/write-proposal-record';
import { writeProposalRecord } from '../proposal/write-proposal-record';
import { requireItemNotPurging } from '../purge/require-item-not-purging';
import { requireSealingKeyCurrent } from '../purge/require-sealing-key-current';
import { buildMergeRecord } from '../record/build-merge-record';
import type {
  Labels,
  MemorySubject,
  ProposalOperationKind,
  QuoteEvidence,
  StoreParts,
} from '../types';
import type { WriteGroup } from '../write/build-write-group';

export interface ProposalPlan {
  readonly operation: ProposalOperationKind;

  readonly target: { readonly itemID: string; readonly version: number } | null;
  readonly isPinned: boolean;
  readonly text: string;
  readonly quote: string | null;
  readonly reason: ReviewReason;
  readonly evidence: QuoteEvidence | null;

  // the record a quote names by its event ID, which a gate that stops before reading the record
  // leaves out of the evidence
  readonly quotedEventID?: number;

  readonly checks: JSONObject;
  readonly checkerReason: string | null;
  readonly caller: WriteCaller;
  readonly group: WriteGroup;

  readonly subject?: MemorySubject;

  readonly newSubject?: MemorySubject;

  readonly until?: number | null;

  // the whole label set the approval applies; a proposal with none writes no label record
  readonly labels?: Labels;

  // the revision the caller read, which a proposal that edits an existing item records
  readonly targetRevision?: number;

  readonly isLabelOnly?: boolean;
}

export interface WrittenProposal {
  readonly proposalID: string;

  // the short ID of the shared row, which is the open proposal's when this one merged into it
  readonly shortID: string;
  readonly merged: boolean;
}

export async function writeMemoryProposal(
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<WrittenProposal> {
  const log = parts.context.log;

  const merged = await withWriteTransaction(log.writer, async (tx) => {
    await requireProposalWritable(tx, plan);

    return writePendingMerge(tx, parts, plan);
  });

  if (merged !== null) {
    return merged;
  }

  const keyed = await createSealedProposal(parts, plan);

  const sealed = keyed.sealed;

  const written = await withWriteTransaction(log.writer, (tx) =>
    writeProposalOrMerge(tx, parts, { pending: { plan, sealed }, keyID: keyed.keyID }),
  ).catch(async (error: unknown) => {
    if (plan.target === null) {
      await removeRecordKey(log, sealed.itemID);
    }

    throw error;
  });

  if (written.merged && plan.target === null) {
    await removeRecordKey(log, sealed.itemID);
  }

  return written;
}

// A proposal that quotes a record a forget began on, or that edits an item a purge has not finished,
// writes nothing.
async function requireProposalWritable(
  tx: Transaction<unknown>,
  plan: ProposalPlan,
): Promise<void> {
  if (plan.evidence !== null) {
    await requireUnforgottenQuote(tx, plan.evidence.recordSequence);
  }

  if (plan.quotedEventID !== undefined) {
    await requireUnforgottenQuote(tx, plan.quotedEventID);
  }

  if (plan.target !== null) {
    await requireItemNotPurging(tx, plan.target.itemID);
  }
}

async function writePendingMerge(
  tx: Transaction<unknown>,
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<WrittenProposal | null> {
  const match = await readMatchingProposal(tx, parts, plan);

  if (match === null) {
    return null;
  }

  await writeRecordsInTransaction(tx, parts.context.log, [
    buildMergeRecord(parts, { proposal: match, plan }),
  ]);

  const open = await readProposal(tx, match.proposal_id);

  invariant(open, 'a pending memory proposal has its shared row');

  return { proposalID: match.proposal_id, shortID: open.shortID, merged: true };
}

interface KeyedPendingProposal {
  readonly pending: PendingProposal;
  readonly keyID: string;
}

async function writeProposalOrMerge(
  tx: Transaction<unknown>,
  parts: StoreParts,
  written: KeyedPendingProposal,
): Promise<WrittenProposal> {
  const pending = written.pending;

  await requireProposalWritable(tx, pending.plan);

  if (pending.plan.target !== null) {
    await requireSealingKeyCurrent(tx, parts.context.log, {
      itemID: pending.sealed.itemID,
      keyID: written.keyID,
    });
  }

  const merged = await writePendingMerge(tx, parts, pending.plan);

  if (merged !== null) {
    return merged;
  }

  const gate = parts.context.gate;

  const proposed = await proposeInTransaction(
    buildProposeDeps({
      log: parts.context.log,
      clock: gate.clock,
      definitions: parts.context.definitions,
    }),
    tx,
    {
      proposalID: pending.sealed.proposalID,
      family: 'memory',
      kind: 'memory_write',
      cause: pending.plan.reason,
      riskClass: 'routine',
      actionHash: pending.sealed.actionHash,
      ruleHash: null,
      thread: pending.plan.caller.thread,
      taskID: pending.plan.caller.taskID,
      deadlineAt: pending.plan.until ?? null,
      sameThing: null,
      intervalMs: gate.limits.proposalLapseMs,
    },
  );

  await writeProposalRecord(tx, parts, pending, proposed.lapsesAt);

  return { proposalID: pending.sealed.proposalID, shortID: proposed.shortID, merged: false };
}
