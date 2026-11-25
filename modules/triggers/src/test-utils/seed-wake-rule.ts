import { withWriteTransaction } from '@heynixie/log';
import type { WakeRuleInput } from '../types';
import type { SetWakeRule } from '../wake/set-wake-rule-in-transaction';
import { setWakeRuleInTransaction } from '../wake/set-wake-rule-in-transaction';
import type { TestTriggers } from './start-test-triggers';

// A wake rule on the conversation, set through the module, over the fields that a test sets. The
// rule is created at the test clock's time.
export function seedWakeRule(
  triggers: Pick<TestTriggers, 'writer' | 'core'>,
  overrides: Partial<WakeRuleInput> = {},
): Promise<SetWakeRule> {
  return withWriteTransaction(triggers.writer, (tx) =>
    setWakeRuleInTransaction(tx, triggers.core, {
      mailbox: { kind: 'mail' },
      match: {},
      target: { kind: 'conversation' },
      setBy: 'conversation',
      expiresAt: null,
      windowMs: 60_000,
      origin: 'tool',
      ...overrides,
    }),
  );
}
