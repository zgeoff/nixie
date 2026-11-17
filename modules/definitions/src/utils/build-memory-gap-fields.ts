import type { Rule } from '@heynixie/policy';
import { listUncoveredMemoryWrites } from '@heynixie/policy';

// One card field per rule that reaches memory and leaves a kind of memory write uncovered, so the
// user reads what each rule will not cover before approving it.
export function buildMemoryGapFields(
  rules: readonly Omit<Rule, 'id'>[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    rules.flatMap((rule, index) => {
      const uncovered = listUncoveredMemoryWrites(rule);

      return uncovered.length === 0
        ? []
        : [[`rule ${String(index + 1)} will not cover`, uncovered.join('; ')]];
    }),
  );
}
