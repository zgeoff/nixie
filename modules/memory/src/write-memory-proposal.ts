import type { JSONObject } from '@heynixie/log';
import { createRecordKey, removeRecordKey, withWriteTransaction } from '@heynixie/log';
import { buildProposalHash } from './build-proposal-hash';
import type { WriteGroup } from './build-write-group';
import { encodeProposalText } from './encode-proposal-text';
import { findItemKey } from './find-item-key';
import type { ReviewReason, WriteCaller } from './gate-types';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import type { QuoteEvidence, StoreParts } from './types';
import type { SealedProposal } from './write-proposal-record';
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
  const itemID = plan.target?.itemID ?? crypto.randomUUID();
  const key = await readProposalKey(parts, plan, itemID);
  const sealed = await buildSealedProposal(key, plan, itemID);

  try {
    await withWriteTransaction(log.writer, (tx) =>
      writeProposalRecord(tx, parts, { plan, sealed }),
    );
  } catch (error) {
    // a new item's key seals nothing but this proposal, so a proposal that never landed drops it
    if (plan.target === null) {
      await removeRecordKey(log, itemID);
    }
    throw error;
  }
  return sealed.proposalID;
}

async function readProposalKey(
  parts: StoreParts,
  plan: ProposalPlan,
  itemID: string,
): Promise<CryptoKey> {
  if (plan.target === null) {
    const created = await createRecordKey(parts.context.log, itemID);

    return created.key;
  }
  const key = await findItemKey(parts.context.log, itemID);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(itemID);
  }
  return key;
}

// the salt sits sealed beside the text, so the action hash says nothing about the text once a
// forget makes the text unreadable
async function buildSealedProposal(
  key: CryptoKey,
  plan: ProposalPlan,
  itemID: string,
): Promise<SealedProposal> {
  const proposalID = crypto.randomUUID();
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(saltBytes))).toString('base64');
  const sealed = await encodeProposalText(key, proposalID, {
    text: plan.text,
    quote: plan.quote,
    checkerReason: plan.checkerReason,
    salt,
  });
  const actionHash = buildProposalHash({
    operation: plan.operation,
    itemID,
    targetVersion: plan.target?.version ?? null,
    isPinned: plan.isPinned,
    text: plan.text,
    quote: plan.quote,
    salt,
  });

  return { proposalID, itemID, sealed, actionHash };
}

const saltBytes = 16;
