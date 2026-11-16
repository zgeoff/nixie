import { createRecordKey } from '@heynixie/log';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import { proposalLabelsCodec } from '../label/proposal-labels-codec';
import type { ProposalPlan } from '../memory/write-memory-proposal';
import type { StoreParts } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { buildProposalHash } from './build-proposal-hash';
import { encodeProposalText } from './encode-proposal-text';
import type { SealedProposal } from './write-proposal-record';

export interface KeyedSealedProposal {
  readonly sealed: SealedProposal;

  // the key the proposal is sealed under
  readonly keyID: string;
}

export async function createSealedProposal(
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<KeyedSealedProposal> {
  const itemID = plan.target?.itemID ?? crypto.randomUUID();

  const key = await readProposalKey(parts, plan, itemID);

  return { sealed: await sealProposal(key, plan, itemID), keyID: key.keyID };
}

interface ProposalKey {
  readonly keyID: string;
  readonly key: CryptoKey;
}

async function readProposalKey(
  parts: StoreParts,
  plan: ProposalPlan,
  itemID: string,
): Promise<ProposalKey> {
  if (plan.target === null) {
    return createRecordKey(parts.context.log, itemID);
  }

  const current = await readCurrentItemKey(parts.context.log, itemID);

  if (current.status !== 'readable') {
    throw new MemoryItemNotFoundError(itemID);
  }

  return current;
}

const saltBytes = 16;

async function sealProposal(
  proposalKey: ProposalKey,
  plan: ProposalPlan,
  itemID: string,
): Promise<SealedProposal> {
  const key = proposalKey.key;
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
    ...(plan.newSubject === undefined ? {} : { newSubject: plan.newSubject }),
    ...(plan.until === undefined ? {} : { until: plan.until }),
    ...(plan.labels === undefined
      ? {}
      : {
          labels: plan.labels,
          targetRevision: plan.targetRevision ?? null,
          isLabelOnly: plan.isLabelOnly === true,
        }),
  });

  const sealedLabels =
    plan.labels === undefined
      ? undefined
      : await proposalLabelsCodec.encode(key, proposalID, plan.labels);

  return {
    proposalID,
    itemID,
    sealed,
    actionHash,
    ...(sealedLabels === undefined ? {} : { sealedLabels }),
  };
}
