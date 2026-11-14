import type { AllowingRule } from '@heynixie/policy';
import type { MemoryWriteVerdict } from '@heynixie/tools';

// The verdict of an allow rule on memory_write, with the checks the rule holds.
export function buildAllowVerdict(
  checks: AllowingRule['checks'] = [],
): Extract<MemoryWriteVerdict, { readonly kind: 'rule-allow' }> {
  return { kind: 'rule-allow', rules: [{ id: 'rule-a', revision: 2, checks }] };
}
