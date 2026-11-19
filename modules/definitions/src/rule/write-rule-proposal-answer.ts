import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { rulesChangeApprovedCodec } from '../change/rules-change-approved-codec';
import { rulesChangeRejectedCodec } from '../change/rules-change-rejected-codec';
import type { RuleContext } from '../runtime/write-runtime-rule';
import type { DefinitionsTables } from '../types';
import type { RuleProposal } from '../utils/rule-proposal-schema';
import { writeBudgetsInForce } from '../utils/write-budgets-in-force';
import { pickRuleProposalMove } from './pick-rule-proposal-move';
import { readRuleProposals } from './read-rule-proposals';

export type RuleProposalAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string };

export type RuleProposalRefusal = 'NOT_FOUND' | 'PROPOSAL_CLOSED';

export type RuleProposalResult =
  | { readonly status: 'approved' | 'rejected'; readonly proposalID: string }
  | { readonly status: 'refused'; readonly code: RuleProposalRefusal; readonly reason: string };

export async function writeRuleProposalAnswer(
  context: RuleContext,
  answer: RuleProposalAnswer,
): Promise<RuleProposalResult> {
  const result = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<RuleProposalResult> => {
      const proposals = await readRuleProposals(tx);

      const seeded = await tx
        .$extendTables<DefinitionsTables>()
        .selectFrom('seeded_rules')
        .select(['rule_id', 'rule_hash'])
        .execute();

      const move = pickRuleProposalMove({
        proposals,
        answer,
        seeded: new Map(seeded.map((row) => [row.rule_id, row.rule_hash])),
        now: context.clock.now(),
      });

      if (move.status === 'refused') {
        return move;
      }

      if (move.status === 'rejected') {
        await writeRuleProposalDecision(tx, context, {
          proposal: move.proposal,
          outcome: 'rejected',
          reason: move.reason,
        });

        return { status: 'rejected', proposalID: answer.proposalID };
      }

      await writeRuleProposalDecision(tx, context, {
        proposal: move.proposal,
        outcome: 'approved',
        reason: '',
      });

      return { status: 'approved', proposalID: answer.proposalID };
    },
  );

  if (result.status === 'approved') {
    await context.runInForceSeed();
  }

  return result;
}

interface RuleProposalDecision {
  readonly proposal: RuleProposal;
  readonly outcome: 'approved' | 'rejected';
  readonly reason: string;
  readonly identityID?: string;
}

// The records of an answer, once the shared checks passed.
export async function writeRuleProposalDecision(
  tx: Transaction<unknown>,
  context: ProposalContext,
  decision: RuleProposalDecision,
): Promise<void> {
  const proposal = decision.proposal;

  if (decision.outcome === 'rejected') {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: rulesChangeRejectedCodec.kind,
        definitions: context.definitions(),
        payload: rulesChangeRejectedCodec.encode({
          proposalID: proposal.proposalID,
          reason: decision.reason,
          ...(decision.identityID === undefined ? {} : { identityID: decision.identityID }),
        }),
      },
    ]);

    return;
  }

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
