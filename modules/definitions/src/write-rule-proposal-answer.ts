import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { canMoveProposal, proposalLapseMs } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { RuleProposal } from './build-rule-proposal';
import { readRuleProposals } from './read-rule-proposals';
import { rulesChangeApprovedCodec } from './rules-change-approved-codec';
import { rulesChangeRejectedCodec } from './rules-change-rejected-codec';
import type { DefinitionsTables } from './types';
import type { RuleContext } from './write-runtime-rule';

export type RuleProposalAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string };

export type RuleProposalRefusal = 'NOT_FOUND' | 'CLOSED' | 'STALE';

export type RuleProposalResult =
  | { readonly status: 'approved' | 'rejected'; readonly proposalID: string }
  | { readonly status: 'refused'; readonly code: RuleProposalRefusal; readonly reason: string };

export async function writeRuleProposalAnswer(
  context: RuleContext,
  answer: RuleProposalAnswer,
): Promise<RuleProposalResult> {
  const result = await withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();

    const proposals = await readRuleProposals(tx);

    const state = proposals.find((entry) => entry.proposal.proposalID === answer.proposalID);

    if (state === undefined) {
      return refuse('NOT_FOUND', `no rule change proposal has ID ${answer.proposalID}`);
    }

    const isPastLapse = state.proposedAt + proposalLapseMs <= now;
    const status = state.outcome ?? (isPastLapse ? 'lapsed' : 'pending');
    const next = answer.answer === 'approve' ? 'approved' : 'rejected';

    if (status === 'withdrawn' || !canMoveProposal(status, next)) {
      return refuse('CLOSED', `the rule change proposal ${answer.proposalID} is ${status}`);
    }

    if (answer.answer === 'reject') {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: rulesChangeRejectedCodec.kind,
          definitions: context.definitions(),
          payload: rulesChangeRejectedCodec.encode({
            proposalID: answer.proposalID,
            reason: answer.reason,
          }),
        },
      ]);

      return { status: 'rejected', proposalID: answer.proposalID } as const;
    }

    if (!(await probeProposalCurrent(tx, state.proposal))) {
      return refuse(
        'STALE',
        `the rules changed since proposal ${answer.proposalID}, so the next seed proposes again`,
      );
    }

    await writeApprovedRules(tx, state.proposal);

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: rulesChangeApprovedCodec.kind,
        definitions: context.definitions(),
        payload: rulesChangeApprovedCodec.encode({ proposalID: answer.proposalID }),
      },
    ]);

    return { status: 'approved', proposalID: answer.proposalID } as const;
  });

  if (result.status === 'approved') {
    await context.seedInForce();
  }

  return result;
}

function refuse(code: RuleProposalRefusal, reason: string): RuleProposalResult {
  return { status: 'refused', code, reason };
}

// The proposal holds each rule's version from before the widening, so an approval applies only
// while the rules seeded from the definitions still hold those versions.
async function probeProposalCurrent(
  tx: Transaction<unknown>,
  proposal: RuleProposal,
): Promise<boolean> {
  const seeded = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('seeded_rules')
    .select(['rule_id', 'rule_hash'])
    .execute();

  const hashes = new Map(seeded.map((row) => [row.rule_id, row.rule_hash]));

  return proposal.changes.every(
    (change) => (hashes.get(change.ruleID) ?? null) === (change.before?.hash ?? null),
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
