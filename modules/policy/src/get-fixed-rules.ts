import { slice1QueueCheckRule } from './slice1-queue-check-rule';
import { testAllowSendRule } from './test-allow-send-rule';
import type { RuleEntry } from './types';

export function getFixedRules(): readonly RuleEntry[] {
  // The release bundle defines NIXIE_TEST_BUILD as false, so the bundler drops the test rule and
  // its import.
  return NIXIE_TEST_BUILD ? [testAllowSendRule, slice1QueueCheckRule] : [slice1QueueCheckRule];
}
