import { ruleBodySchema } from '@heynixie/policy';
import type { ProposalContext, SharedProposalState } from '@heynixie/proposals';
import { readProposal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { collectConditionFaults } from '../utils/collect-condition-faults';
import { readProposalRecords } from '../utils/read-proposal-records';
import { ruleProposedCodec } from './rule-proposed-codec';
import { withdrawRuleProposal } from './withdraw-rule-proposal';
import { writeProposedRule } from './write-proposed-rule';

export interface ProposedRuleEditRequest {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly rule: unknown;
}

export type ProposedRuleEdit =
  | { readonly status: 'edited'; readonly proposalID: string; readonly shortID: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'closed'; readonly state: SharedProposalState }
  | { readonly status: 'conflict'; readonly actionHash: string }
  | { readonly status: 'invalid'; readonly faults: readonly string[] };

// An edit writes a new proposal, because a row keeps its hash and its risk class for life. The new
// proposal keeps the group and its approvals. The caller owns the transaction.
export async function writeProposedRuleEdit(
  tx: Transaction<unknown>,
  context: ProposalContext,
  edit: ProposedRuleEditRequest,
): Promise<ProposedRuleEdit> {
  const row = await readProposal(tx, edit.proposalID);

  if (row?.cause !== 'proposed_rule') {
    return { status: 'not_found' };
  }

  if (row.state !== 'pending' && row.state !== 'deferred') {
    return { status: 'closed', state: row.state };
  }

  if (row.actionHash !== edit.actionHash) {
    return { status: 'conflict', actionHash: row.actionHash };
  }

  const parsed = ruleBodySchema.safeParse(edit.rule);

  if (!parsed.success) {
    return {
      status: 'invalid',
      faults: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  if (parsed.data.outcome !== 'allow') {
    return { status: 'invalid', faults: ['outcome: an edited rule stays an allow rule'] };
  }

  const conditionFaults = collectConditionFaults([parsed.data]).map((fault) =>
    fault.replace(/^rules\.1\./u, ''),
  );

  if (conditionFaults.length > 0) {
    return { status: 'invalid', faults: conditionFaults };
  }

  const records = await readProposalRecords(context.log, tx, [row]);

  const record = records.get(row.createdSequence);

  invariant(record, 'a proposed rule has its record');

  const proposed = ruleProposedCodec.decode(record.payload);

  await withdrawRuleProposal(tx, context, row.id);

  const written = await writeProposedRule(tx, context, {
    groupHash: proposed.groupHash,
    rule: parsed.data,
    approvals: proposed.approvals,
    editOf: row.id,
  });

  return { status: 'edited', proposalID: written.proposalID, shortID: written.shortID };
}
