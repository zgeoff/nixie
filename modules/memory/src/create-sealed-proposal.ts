import { createRecordKey } from '@heynixie/log';
import { buildProposalHash } from './build-proposal-hash';
import { encodeProposalText } from './encode-proposal-text';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readItemKey } from './read-item-key';
import type { StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';
import type { SealedProposal } from './write-proposal-record';

export async function createSealedProposal(
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<SealedProposal> {
  const itemID = plan.target?.itemID ?? crypto.randomUUID();

  const key = await readProposalKey(parts, plan, itemID);

  return sealProposal(key, plan, itemID);
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

  const key = await readItemKey(parts.context.log, itemID);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(itemID);
  }

  return key;
}

const saltBytes = 16;

async function sealProposal(
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
    ...(plan.until === undefined ? {} : { until: plan.until }),
  });

  const actionHash = buildProposalHash({
    operation: plan.operation,
    itemID,
    targetVersion: plan.target?.version ?? null,
    isPinned: plan.isPinned,
    text: plan.text,
    quote: plan.quote,
    salt,
    ...(plan.subject === undefined ? {} : { subject: plan.subject }),
    ...(plan.until === undefined ? {} : { until: plan.until }),
  });

  return { proposalID, itemID, sealed, actionHash };
}
