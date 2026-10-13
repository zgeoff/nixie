import { createRecordKey } from '@heynixie/log';
import { buildProposalHash } from './build-proposal-hash';
import { encodeProposalText } from './encode-proposal-text';
import { findItemKey } from './find-item-key';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import type { StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';
import type { SealedProposal } from './write-proposal-record';

// Seals a proposal's text under its item's key and binds its action hash. A proposal for a new
// item creates that item's key, which the caller removes when the proposal never lands.
export async function createSealedProposal(
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<SealedProposal> {
  const itemID = plan.target?.itemID ?? crypto.randomUUID();
  const key = await readProposalKey(parts, plan, itemID);

  return buildSealedProposal(key, plan, itemID);
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
