import { withWriteTransaction } from '@heynixie/log';
import type { ProposalConfig, ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';
import { buildProposedRule } from './build-proposed-rule';
import { canProposeRule } from './can-propose-rule';
import { pickQuietUntil } from './pick-quiet-until';
import { readSuggestedRuleCalls } from './read-suggested-rule-calls';
import type { SuggestedRuleSettings } from './suggested-rule-settings';
import { dayMs } from './suggested-rule-settings';
import { writeProposedRule } from './write-proposed-rule';

export type SuggestedRuleContext = ProposalContext & {
  readonly proposalConfig?: ProposalConfig | undefined;
};

// Checks one group in a transaction of its own, and proposes its rule when the group qualifies.
export function runSuggestedRuleCheck(
  context: SuggestedRuleContext,
  settings: SuggestedRuleSettings,
  groupHash: string,
): Promise<void> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeSuggestedRuleCheck(tx, context, settings, groupHash),
  );
}

async function writeSuggestedRuleCheck(
  tx: Transaction<unknown>,
  context: SuggestedRuleContext,
  settings: SuggestedRuleSettings,
  groupHash: string,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();
  const now = context.clock.now();

  const group = await tables
    .selectFrom('suggested_rule_groups')
    .select(['quiet_until', 'proposal_id', 'lapsed_at'])
    .where('group_hash', '=', groupHash)
    .executeTakeFirst();

  if (group === undefined) {
    return;
  }

  const answers = await tables
    .selectFrom('suggested_rule_answers')
    .select(['proposal_id', 'answer', 'answered_sequence'])
    .where('group_hash', '=', groupHash)
    .where('answered_at', '>=', now - settings.windowDays * dayMs)
    .orderBy('answered_at')
    .execute();

  const approved = answers.filter((answer) => answer.answer === 'approved');

  const isProposable = canProposeRule({
    now,
    approvals: settings.approvals,
    approvedCount: approved.length,
    declinedCount: answers.length - approved.length,
    hasOpenProposal: group.proposal_id !== null,
    quietUntil: pickQuietUntil(group.quiet_until, group.lapsed_at, settings.quietDays * dayMs),
  });

  if (isProposable) {
    const calls = await readSuggestedRuleCalls(
      tx,
      context.log,
      approved.map((answer) => answer.proposal_id),
    );

    const [first, ...rest] = calls;
    const rule = first === undefined ? null : buildProposedRule([first, ...rest]);

    if (rule !== null && calls.length >= settings.approvals) {
      await writeProposedRule(tx, context, {
        groupHash,
        rule,
        approvals: calls.map((call) => call.proposalID),
        editOf: null,
      });
    }
  }

  const latest = await tables
    .selectFrom('suggested_rule_answers')
    .select((eb) => eb.fn.max<number>('answered_sequence').as('latest'))
    .where('group_hash', '=', groupHash)
    .executeTakeFirst();

  await tables
    .updateTable('suggested_rule_groups')
    .set({ checked_sequence: latest?.latest ?? null })
    .where('group_hash', '=', groupHash)
    .execute();
}
