import { slice1ReadOnlyRule } from './slice1-read-only-rule';
import { testAllowSendRule } from './test-allow-send-rule';
import type { FixedRule } from './types';

// The fixed rules in force, in the order the decision point tries them, which the snapshot hash
// covers. The release bundle defines NIXIE_TEST_BUILD as false and drops the test rule with its
// import.
export function getFixedRules(): readonly FixedRule[] {
  return NIXIE_TEST_BUILD ? [testAllowSendRule, slice1ReadOnlyRule] : [slice1ReadOnlyRule];
}
