import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { seedWakeRule, startTestTriggers } from '@heynixie/triggers/test-utils';
import { startGmailTools } from '../test-utils/start-gmail-tools';
import { buildGmailMailbox } from './build-gmail-mailbox';

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
      mailbox: buildGmailMailbox(tools.site.context.connectionID),
      at: triggers.clock.now(),
    });

  return { ...tools, triggers, taskSeed, starter, call, readRules };
}

test('it lists every live rule of the connection, and leaves out a rule of the own mailbox', async () => {
  const ctx = await setupTest();

  await seedWakeRule(ctx.triggers, {
    mailbox: buildGmailMailbox(ctx.site.context.connectionID),
    match: { subject: 'invoice' },
  });

  await seedWakeRule(ctx.triggers, { match: { subject: 'sign-in' } });

  const outcome = await ctx.call('gmail.wake_list', {});

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { rules: [{ match: { subject: 'invoice' }, wake: 'conversation', origin: 'tool' }] },
  });
});
