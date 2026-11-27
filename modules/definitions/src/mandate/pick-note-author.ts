import type { Rule } from '@heynixie/policy';

// A note reads as nixie's only when the rule belongs to a mandate that nixie proposed.
export function pickNoteAuthor(
  rule: Pick<Rule, 'mandate'>,
  authors: ReadonlyMap<string, 'you' | 'nixie'>,
): 'you' | 'nixie' {
  return rule.mandate !== undefined && authors.get(rule.mandate) === 'nixie' ? 'nixie' : 'you';
}
