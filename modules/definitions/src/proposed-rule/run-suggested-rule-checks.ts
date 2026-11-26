import type { DefinitionsTables } from '../types';
import type { SuggestedRuleContext } from './run-suggested-rule-check';
import { runSuggestedRuleCheck } from './run-suggested-rule-check';
import type { SuggestedRuleSettings } from './suggested-rule-settings';

// At start, checks each group that gained an answer after its last check, so a crash between an
// answer and its check loses no proposal.
export async function runSuggestedRuleChecks(
  context: SuggestedRuleContext,
  settings: SuggestedRuleSettings,
): Promise<number> {
  const groups = await context.log.writer.db
    .$extendTables<DefinitionsTables>()
    .selectFrom('suggested_rule_groups')
    .innerJoin(
      'suggested_rule_answers',
      'suggested_rule_answers.group_hash',
      'suggested_rule_groups.group_hash',
    )
    .select('suggested_rule_groups.group_hash')
    .groupBy('suggested_rule_groups.group_hash')
    .having((eb) =>
      eb(
        eb.fn.max('suggested_rule_answers.answered_sequence'),
        '>',
        eb.fn.coalesce('suggested_rule_groups.checked_sequence', eb.val(0)),
      ),
    )
    .execute();

  for (const group of groups) {
    await runSuggestedRuleCheck(context, settings, group.group_hash);
  }

  return groups.length;
}
