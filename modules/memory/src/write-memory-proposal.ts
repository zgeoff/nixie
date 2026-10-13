import type { JSONObject } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction } from '@heynixie/log';
import type { WriteGroup } from './build-write-group';
import { createSealedProposal } from './create-sealed-proposal';
import type { ReviewReason, WriteCaller } from './gate-types';
import type { QuoteEvidence, StoreParts } from './types';
import { writeProposalRecord } from './write-proposal-record';

export interface ProposalPlan {
  readonly operation: 'remember' | 'retire';

  // the item to edit or retire and the version the caller read, or null for a new item
  readonly target: { readonly itemID: string; readonly version: number } | null;
  readonly isPinned: boolean;
  readonly text: string;
  readonly quote: string | null;
  readonly reason: ReviewReason;
  readonly evidence: QuoteEvidence | null;
  readonly checks: JSONObject;
  readonly checkerReason: string | null;
  readonly caller: WriteCaller;
  readonly group: WriteGroup;
}

// Writes a memory proposal bound to its exact operation, sealed under its item's key. A proposal
// for a new item creates that item's key, and its approval creates the item under it.
export async function writeMemoryProposal(parts: StoreParts, plan: ProposalPlan): Promise<string> {
  const log = parts.context.log;
  const sealed = await createSealedProposal(parts, plan);

  try {
    await withWriteTransaction(log.writer, (tx) =>
      writeProposalRecord(tx, parts, { plan, sealed }),
    );
  } catch (error) {
    // a new item's key seals nothing but this proposal, so a proposal that never landed drops it
    if (plan.target === null) {
      await removeRecordKey(log, sealed.itemID);
    }
    throw error;
  }
  return sealed.proposalID;
}
