import type { ProposalContext } from '@heynixie/proposals';
import type { DefinitionsTables } from '../types';
import type { GapSettings } from './gap-settings';
import { runGapCheck } from './run-gap-check';

// At start, checks each group that gained an answer after its last check, so a crash between an
// answer and its check loses no proposal.
export async function runGapChecks(
  context: ProposalContext,
  settings: GapSettings,
): Promise<number> {
  const groups = await context.log.writer.db
    .$extendTables<DefinitionsTables>()
    .selectFrom('gap_groups')
    .innerJoin('gap_answers', 'gap_answers.group_hash', 'gap_groups.group_hash')
    .select('gap_groups.group_hash')
    .groupBy('gap_groups.group_hash')
    .having((eb) =>
      eb(
        eb.fn.max('gap_answers.answered_sequence'),
        '>',
        eb.fn.coalesce('gap_groups.checked_sequence', eb.val(0)),
      ),
    )
    .execute();

  for (const group of groups) {
    await runGapCheck(context, settings, group.group_hash);
  }

  return groups.length;
}
