import { expect, test } from 'bun:test';
import { readWakeRules } from '../wake/read-wake-rules';
import { seedWakeRule } from './seed-wake-rule';
import { startTestTriggers } from './start-test-triggers';

test('it sets a rule that reads back through the module', async () => {
  const triggers = await startTestTriggers();
  const rule = await seedWakeRule(triggers, { match: { from: ['@library.example.org'] } });

  const rules = await readWakeRules(triggers.writer.db, {
    mailbox: { kind: 'mail' },
    at: triggers.clock.now(),
  });

  expect(rules).toStrictEqual([
    {
      ruleID: rule.ruleID,
      shortID: rule.shortID,
      mailbox: { kind: 'mail' },
      match: { from: ['@library.example.org'] },
      target: { kind: 'conversation' },
      setBy: 'conversation',
      expiresAt: null,
      windowMs: 60_000,
      origin: 'tool',
      createdAt: triggers.clock.now(),
    },
  ]);
});
