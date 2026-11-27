import type { WakeRule } from '@heynixie/connections';

// The earliest start among the reply rules that no committed poll has read the mail of again, or
// null when none is left. A reply that arrived before its rule existed was dropped, so the poll
// reads the mail again from the start of the rule, which a send sets to the time the send began.
export function pickReplayStart(
  rules: readonly Pick<WakeRule, 'ruleID' | 'createdAt'>[],
  replayed: readonly string[],
): number | null {
  const pending = rules.filter((rule) => !replayed.includes(rule.ruleID));

  return pending.length === 0 ? null : Math.min(...pending.map((rule) => rule.createdAt));
}
