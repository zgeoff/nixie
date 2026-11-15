import { withWriteTransaction } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';
import { buildProposedRule } from './build-proposed-rule';
import { canProposeRule } from './can-propose-rule';
import type { GapSettings } from './gap-settings';
import { dayMs } from './gap-settings';
import { readGapCalls } from './read-gap-calls';
import { writeProposedRule } from './write-proposed-rule';

// Checks one group in a transaction of its own, and proposes its rule when the group qualifies.
export function runGapCheck(
  context: ProposalContext,
  settings: GapSettings,
  groupHash: string,
): Promise<void> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeGapCheck(tx, context, settings, groupHash),
  );
}

async function writeGapCheck(
  tx: Transaction<unknown>,
  context: ProposalContext,
  settings: GapSettings,
  groupHash: string,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();
  const now = context.clock.now();

  const group = await tables
    .selectFrom('gap_groups')
    .select(['quiet_until', 'proposal_id'])
    .where('group_hash', '=', groupHash)
    .executeTakeFirst();

  if (group === undefined) {
    return;
  }

  const answers = await tables
    .selectFrom('gap_answers')
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
    quietUntil: group.quiet_until,
  });

  if (isProposable) {
    const calls = await readGapCalls(
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
    .selectFrom('gap_answers')
    .select((eb) => eb.fn.max<number>('answered_sequence').as('latest'))
    .where('group_hash', '=', groupHash)
    .executeTakeFirst();

  await tables
    .updateTable('gap_groups')
    .set({ checked_sequence: latest?.latest ?? null })
    .where('group_hash', '=', groupHash)
    .execute();
}
