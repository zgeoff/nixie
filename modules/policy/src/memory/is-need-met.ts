import { match } from 'ts-pattern';
import type { AllowingRule } from '../types';

// What a memory write needs an allow rule to check before the rule covers it: nothing for a plain
// write, a `subject` check for a write whose subject is self, a check on the `image` argument for a
// write from a photo, and both of those checks in the one rule for a self-note from a photo.
export type RuleNeed = 'none' | 'self_note' | 'photo' | 'self_note_photo';

export function isNeedMet(rule: Pick<AllowingRule, 'checks'>, need: RuleNeed): boolean {
  return match(need)
    .with('none', () => true)
    .with('self_note', () => hasSubjectCheck(rule))
    .with('photo', () => hasImageCheck(rule))
    .with('self_note_photo', () => hasSubjectCheck(rule) && hasImageCheck(rule))
    .exhaustive();
}

function hasSubjectCheck(rule: Pick<AllowingRule, 'checks'>): boolean {
  return rule.checks.some(
    (check) => check.arg === 'subject' && check.op === 'eq' && check.value === 'self',
  );
}

function hasImageCheck(rule: Pick<AllowingRule, 'checks'>): boolean {
  return rule.checks.some((check) => check.arg.startsWith('image.'));
}
