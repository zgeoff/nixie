import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { seedWakeRule, startTestTriggers } from '../test-utils';
import { endWakeRuleInTransaction } from './end-wake-rule-in-transaction';
import { readWakeRules } from './read-wake-rules';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    readRules: () =>
      readWakeRules(triggers.writer.db, { mailbox: { kind: 'mail' }, at: triggers.clock.now() }),
  };
}

test('#setWakeRuleInTransaction replaces a live rule with the same match and target in place', async () => {
  const ctx = await setupTest();
  const first = await seedWakeRule(ctx, { match: { subject: 'code' }, windowMs: 60_000 });

  ctx.clock.advance(5000);

  const second = await seedWakeRule(ctx, {
    match: { subject: 'code' },
    windowMs: 120_000,
    expiresAt: ctx.clock.now() + 600_000,
  });

  const rules = await ctx.readRules();

  expect([second.replaced, second.ruleID, second.shortID, second.createdAt]).toStrictEqual([
    true,
    first.ruleID,
    first.shortID,
    first.createdAt,
  ]);

  expect(rules.map((rule) => [rule.ruleID, rule.windowMs])).toStrictEqual([
    [first.ruleID, 120_000],
  ]);
});

test('#setWakeRuleInTransaction keeps rules with another target apart', async () => {
  const ctx = await setupTest();

  await seedWakeRule(ctx, { match: { subject: 'code' } });

  const other = await seedWakeRule(ctx, {
    match: { subject: 'code' },
    target: { kind: 'task', taskID: 'task-1' },
  });

  expect(other.replaced).toBe(false);

  const awaited1 = await ctx.readRules();

  expect(awaited1).toHaveLength(2);
});

test('#setWakeRuleInTransaction sets a rule that stays with no expiry', async () => {
  const ctx = await setupTest();

  await seedWakeRule(ctx, { expiresAt: null });

  ctx.clock.advance(365 * 24 * 3_600_000);

  const awaited2 = await ctx.readRules();

  expect(awaited2).toHaveLength(1);
});

test('#readWakeRules leaves out a rule that expired', async () => {
  const ctx = await setupTest();

  await seedWakeRule(ctx, { expiresAt: ctx.clock.now() + 1000 });

  ctx.clock.advance(1000);

  const awaited3 = await ctx.readRules();

  expect(awaited3).toStrictEqual([]);
});

test('#endWakeRuleInTransaction ends a rule once, and reads no more of it', async () => {
  const ctx = await setupTest();
  const rule = await seedWakeRule(ctx);

  const first = await withWriteTransaction(ctx.writer, (tx) =>
    endWakeRuleInTransaction(tx, ctx.core, rule.ruleID, 'cancelled'),
  );

  const second = await withWriteTransaction(ctx.writer, (tx) =>
    endWakeRuleInTransaction(tx, ctx.core, rule.ruleID, 'cancelled'),
  );

  expect([first, second]).toStrictEqual([true, false]);

  const awaited4 = await ctx.readRules();

  expect(awaited4).toStrictEqual([]);
});

test('#readWakeRules leaves out a rule whose task ended', async () => {
  const ctx = await setupTest();

  const taskSeed = buildTaskSeeder({
    context: ctx.context,
  });

  const starter = await taskSeed.conversationStep();

  const taskID = await taskSeed.doneTask({
    starter: starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  await seedWakeRule(ctx, { target: { kind: 'task', taskID } });

  const awaited5 = await ctx.readRules();

  expect(awaited5).toStrictEqual([]);
});
