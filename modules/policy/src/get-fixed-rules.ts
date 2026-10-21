import { slice1QueueCheckRule } from './slice1-queue-check-rule';
import { slice1ReadOnlyRule } from './slice1-read-only-rule';
import { testAllowSendRule } from './test-allow-send-rule';
import type { FixedRule } from './types';

export function getFixedRules(): readonly FixedRule[] {
  // The release bundle defines NIXIE_TEST_BUILD as false, so the bundler drops the test rule and
  // its import.
  return NIXIE_TEST_BUILD
    ? [testAllowSendRule, slice1QueueCheckRule, slice1ReadOnlyRule]
    : [slice1QueueCheckRule, slice1ReadOnlyRule];
}
