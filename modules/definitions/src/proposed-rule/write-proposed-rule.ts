import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Rule } from '@heynixie/policy';
import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { describeProposedRule, toRuleBodyForm } from './describe-proposed-rule';
import { ruleProposedCodec } from './rule-proposed-codec';

export interface ProposedRuleWrite {
  readonly groupHash: string;
  readonly rule: Omit<Rule, 'id'>;

  // the UUIDs of the action proposals the rule covers
  readonly approvals: readonly string[];
  readonly editOf: string | null;
}

// The rule waits in erasable fields, so a rule you turn down leaves no address in a plain column.
export async function writeProposedRule(
  tx: Transaction<unknown>,
  context: ProposalContext,
  write: ProposedRuleWrite,
): Promise<{ readonly proposalID: string; readonly shortID: string }> {
  const proposalID = crypto.randomUUID();
  const shortID = createShortID();
  const facts = describeProposedRule(write.rule);

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: ruleProposedCodec.kind,
      definitions: context.definitions(),
      payload: ruleProposedCodec.encode({
        proposalID,
        shortID,
        groupHash: write.groupHash,
        ruleHash: facts.ruleHash,
        actionHash: facts.actionHash,
        riskClass: facts.riskClass,
        approvals: [...write.approvals],
        editOf: write.editOf,
      }),
      erasable: { rule: toRuleBodyForm(write.rule) },
    },
  ]);

  return { proposalID, shortID };
}
