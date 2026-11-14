import type { MemoryWriteVerdict } from '@heynixie/tools';
import { match } from 'ts-pattern';

// What a write needs an allow rule to check before the rule covers it: nothing for a plain write, a
// `subject` check for a self-note, a check on the `image` argument for a write from a photo.
export type RuleNeed = 'none' | 'self_note' | 'photo';

export interface CoveringRule {
  readonly id: string;
  readonly revision: number;
}

// The first allow rule that matched the call and holds the check the write needs, or null when the
// write has no allow rule or no rule holds the check.
export function pickCoveringRule(
  verdict: MemoryWriteVerdict | undefined,
  need: RuleNeed,
): CoveringRule | null {
  if (verdict?.kind !== 'rule-allow') {
    return null;
  }

  const covering = verdict.rules.find((rule) => isNeedMet(rule, need));

  return covering === undefined ? null : { id: covering.id, revision: covering.revision };
}

type AllowRule = Extract<MemoryWriteVerdict, { readonly kind: 'rule-allow' }>['rules'][number];

function isNeedMet(rule: AllowRule, need: RuleNeed): boolean {
  return match(need)
    .with('none', () => true)
    .with('self_note', () =>
      rule.checks.some(
        (check) => check.arg === 'subject' && check.op === 'eq' && check.value === 'self',
      ),
    )
    .with('photo', () => rule.checks.some((check) => check.arg.startsWith('image.')))
    .exhaustive();
}
