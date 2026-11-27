import type { Rule } from '../types';
import { checkCondition } from './check-condition';
import { renderConditionWords } from './render-condition-words';

export interface RuleCondition {
  readonly note: string;

  // 'you' for a rule from the definitions repo or from your edit through rules.editProposedRule;
  // 'nixie' for a rule nixie proposed through rules.propose_mandate
  readonly noteBy: 'you' | 'nixie';

  // the view as one sentence, built here so every client shows the same words
  readonly words: string;

  // the raw CEL
  readonly source: string;
}

export const invalidConditionWords =
  'its condition fails nixie’s check, so it errors on every call';

// What a card shows for a rule with a condition, or undefined for a rule with none. The note of a
// stored rule from before the note was required reads as empty.
export function describeCondition(
  rule: Pick<Rule, 'cel' | 'note'>,
  noteBy: RuleCondition['noteBy'],
): RuleCondition | undefined {
  if (rule.cel === undefined) {
    return undefined;
  }

  const checked = checkCondition({ cel: rule.cel, note: rule.note });

  return {
    note: rule.note ?? '',
    noteBy,
    words: checked.ok ? renderConditionWords(checked.view) : invalidConditionWords,
    source: rule.cel,
  };
}

// The note of a rule in force reads as nixie's when the rule belongs to a mandate that came from
// inside nixie, and as yours when it came from the definitions repo or your edit.
export function describeRuleCondition(
  rule: Pick<Rule, 'cel' | 'note' | 'mandate'>,
  origin: 'definitions' | 'nixie' | null,
): RuleCondition | undefined {
  const isNixie = rule.mandate !== undefined && origin !== 'definitions';
  const noteBy = isNixie ? 'nixie' : 'you';

  return describeCondition(rule, noteBy);
}
