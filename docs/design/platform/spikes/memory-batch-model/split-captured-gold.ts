import { conversation } from './conversation.ts';

// Splits the applied gold facts into those captured and those only partly captured: a fact is
// partial when an active item still states its older form, by the fixture's stale rules.
export function splitCapturedGold(
  applied: Iterable<string>,
  active: string[],
): { captured: string[]; partial: string[] } {
  const captured: string[] = [];
  const partial: string[] = [];
  for (const id of applied) {
    const rule = conversation.stale[id];
    const stale =
      rule !== undefined &&
      active.some(
        (text) =>
          new RegExp(rule.stale, 'iu').test(text) &&
          (rule.fresh === null || !new RegExp(rule.fresh, 'iu').test(text)),
      );
    (stale ? partial : captured).push(id);
  }
  return { captured, partial };
}
