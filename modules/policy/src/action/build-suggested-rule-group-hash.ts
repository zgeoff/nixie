import { createHash } from 'node:crypto';
import type { RuleContext } from '../types';
import { toCanonicalText } from '../utils/to-canonical-text';

export interface SuggestedRuleGroupKey {
  // the exact tool name, with its variant
  readonly tool: string;
  readonly context: RuleContext;
  readonly destinations: readonly string[];
}

// The hash of the group that a no_rule call joins: its tool, its context and its destinations as
// a set, in NFC.
export function buildSuggestedRuleGroupHash(key: SuggestedRuleGroupKey): string {
  const destinations = [
    ...new Set(key.destinations.map((value) => value.normalize('NFC'))),
  ].toSorted();

  return createHash('sha256')
    .update(toCanonicalText({ tool: key.tool, context: key.context, destinations }))
    .digest('hex');
}
