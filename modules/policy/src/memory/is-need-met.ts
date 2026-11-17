import { match } from 'ts-pattern';
import type { AllowingRule } from '../types';

// What a memory write needs an allow rule to check before the rule covers it: nothing for a plain
// write, a `subject` check for a write whose subject is self, a check on the `image` argument for a
// write from a photo.
export type RuleNeed = 'none' | 'self_note' | 'photo';

export function isNeedMet(rule: Pick<AllowingRule, 'checks'>, need: RuleNeed): boolean {
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
