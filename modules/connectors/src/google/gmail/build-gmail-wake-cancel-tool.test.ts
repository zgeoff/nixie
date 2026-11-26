import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { seedWakeRule, startTestTriggers } from '@heynixie/triggers/test-utils';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const triggers = await startTestTriggers();

  const taskSeed = buildTaskSeeder({ context: triggers.context });

  const starter = await taskSeed.conversationStep();
  const tools = await startGmailTools({ triggers });

  const call = async (name: string, input: JSONObject) => {
    const tool = tools.findAction(name).tool;
    const context = tools.buildContext();

    const resolved = await tool.resolveInput?.(input, context);

    if (resolved?.status === 'error') {
      return { status: 'error' as const, message: resolved.message };
    }

    const resolvedInput = resolved?.status === 'ok' ? resolved.input : input;

    return tool.run(
      { callID: 'call-1', tool: name, input: resolvedInput, toolUseID: null },
      context,
    );
  };

  const readRules = () =>
    readWakeRules(triggers.writer.db, {
      mailbox: { kind: 'gmail', connectionID: tools.site.context.connectionID },
      at: triggers.clock.now(),
    });

  return { ...tools, triggers, taskSeed, starter, call, readRules };
}

test('it cancels a rule of a connection by its ID', async () => {
  const ctx = await setupTest();
  const set = await ctx.call('gmail.wake_set', { subject: 'invoice' });
  const [rule] = await ctx.readRules();
  const cancelled = await ctx.call('gmail.wake_cancel', { rule: rule?.shortID ?? '' });
  const rules = await ctx.readRules();

  expect(set.status).toBe('ok');

  expect(cancelled).toStrictEqual({
    status: 'ok',
    result: { rule: rule?.shortID ?? '', ended: true },
  });

  expect(rules).toStrictEqual([]);
});

test('it refuses UNKNOWN_RULE for a rule of the own mailbox', async () => {
  const ctx = await setupTest();
  const own = await seedWakeRule(ctx.triggers, { match: { subject: 'sign-in' } });
  const outcome = await ctx.call('gmail.wake_cancel', { rule: own.shortID });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('UNKNOWN_RULE'),
  });
});
