import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { rulesChangeApprovedCodec } from '../change/rules-change-approved-codec';
import type { DefinitionsTables } from '../types';
import type { RuleProposal } from '../utils/rule-proposal-schema';
import { writeBudgetsInForce } from '../utils/write-budgets-in-force';

interface RuleProposalDecision {
  readonly proposal: RuleProposal;
  readonly outcome: 'approved';
  readonly identityID?: string;
}

// The records of an answer, once the shared checks passed.
export async function writeRuleProposalDecision(
  tx: Transaction<unknown>,
  context: ProposalContext,
  decision: RuleProposalDecision,
): Promise<void> {
  const proposal = decision.proposal;

  await writeApprovedRules(tx, proposal);

  const [approved] = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: rulesChangeApprovedCodec.kind,
      definitions: context.definitions(),
      payload: rulesChangeApprovedCodec.encode({
        proposalID: proposal.proposalID,
        ...(decision.identityID === undefined ? {} : { identityID: decision.identityID }),
      }),
    },
  ]);

  invariant(approved);

  await writeBudgetsInForce(
    tx,
    proposal.budgetChanges.map((change) => ({
      budgetID: change.budgetID,
      after:
        change.after === null
          ? null
          : {
              id: change.budgetID,
              counts: change.after.counts,
              limitMicros: change.after.limitMicros,
              period: change.after.period,
              hash: change.after.hash,
            },
    })),
    approved.sequence,
  );
}

async function writeApprovedRules(tx: Transaction<unknown>, proposal: RuleProposal) {
  const tables = tx.$extendTables<DefinitionsTables>();

  for (const change of proposal.changes) {
    await tables.deleteFrom('seeded_rules').where('rule_id', '=', change.ruleID).execute();

    if (change.after !== null) {
      await tables
        .insertInto('seeded_rules')
        .values({ rule_id: change.ruleID, rule_hash: change.after.hash })
        .execute();
    }
  }
}
