import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalConfig, ProposalContext } from '@heynixie/proposals';
import { buildProposeDeps, proposeInTransaction } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { describeMandate } from './describe-mandate';
import type { MandateInput } from './mandate-input-schema';
import { mandateProposedCodec } from './mandate-proposed-codec';
import { pickMandate } from './pick-mandate';
import type { MandateRefusal } from './pick-mandate';

export interface MandateProposalOptions {
  readonly maxHours: number;
  readonly readZone: (tx: Transaction<unknown>) => Promise<string>;
}

export interface MandateProposal {
  readonly input: MandateInput;
  readonly proposedBy: 'owner' | 'nixie';
}

export type MandateProposalResult =
  | {
      readonly status: 'proposed';
      readonly proposalID: string;
      readonly shortID: string;
      readonly mandateID: string;
      readonly expires: number;
      readonly sentences: readonly string[];
    }
  | MandateRefusal;

// The caller owns the transaction. The title and the rules wait in erasable fields, so a mandate you
// turn down leaves nothing in a plain column.
export async function writeMandateProposal(
  tx: Transaction<unknown>,
  context: ProposalContext & { readonly proposalConfig?: ProposalConfig | undefined },
  options: MandateProposalOptions,
  proposal: MandateProposal,
): Promise<MandateProposalResult> {
  const mandateID = createShortID().toLowerCase();

  const picked = pickMandate(proposal.input, {
    mandateID,
    now: context.clock.now(),
    zone: await options.readZone(tx),
    maxHours: options.maxHours,
  });

  if (picked.status === 'refused') {
    return picked;
  }

  const facts = describeMandate(mandateID, picked.expires, picked.rules);

  const proposed = await proposeInTransaction(
    buildProposeDeps({ ...context, config: context.proposalConfig }),
    tx,
    {
      family: 'rule_change',
      kind: 'internal_change',
      cause: 'mandate',
      riskClass: facts.riskClass,
      actionHash: facts.actionHash,
      ruleHash: null,
      thread: null,
      taskID: null,
      deadlineAt: picked.expires,
      sameThing: null,
      intervalMs: null,
    },
  );

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: mandateProposedCodec.kind,
      definitions: context.definitions(),
      payload: mandateProposedCodec.encode({
        proposalID: proposed.proposalID,
        shortID: proposed.shortID,
        mandateID,
        ruleHashes: facts.ruleHashes,
        actionHash: facts.actionHash,
        riskClass: facts.riskClass,
        expires: picked.expires,
        proposedBy: proposal.proposedBy,
      }),
      erasable: { title: proposal.input.title, rules: facts.forms },
    },
  ]);

  return {
    status: 'proposed',
    proposalID: proposed.proposalID,
    shortID: proposed.shortID,
    mandateID,
    expires: picked.expires,
    sentences: facts.sentences,
  };
}
