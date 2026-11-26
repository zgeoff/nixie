import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { startTestTriggers } from '@heynixie/triggers/test-utils';
import { startGmailTools } from '../../test-utils/start-gmail-tools';
import { readGmailBodyFields } from './read-gmail-body-fields';

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

test('it sets a wake rule on the connection, starting now and expiring from now', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('gmail.wake_set', {
    from: ['@bank.example.org'],
    expires: '3d',
    window: '1h',
  });

  const [rule] = await ctx.readRules();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      rule: rule?.shortID ?? '',
      expiresAt: new Date(ctx.clock.now() + 3 * 86_400_000).toISOString(),
      window: '1h',
      replaced: false,
    },
  });

  expect(rule).toMatchObject({
    match: { from: ['@bank.example.org'] },
    target: { kind: 'conversation' },
    origin: 'tool',
    createdAt: ctx.clock.now(),
  });
});

test('it replaces a live rule that has the same match and target, and says so', async () => {
  const ctx = await setupTest();
  const first = await ctx.call('gmail.wake_set', { subject: 'invoice', expires: '1d' });
  const second = await ctx.call('gmail.wake_set', { subject: 'invoice', expires: '2d' });
  const rules = await ctx.readRules();

  expect(first).toMatchObject({ status: 'ok', result: { replaced: false } });
  expect(second).toMatchObject({ status: 'ok', result: { replaced: true } });
  expect(rules).toHaveLength(1);
});

test('it takes the connection from the prefix of a thread ID and stores Gmail’s own thread ID', async () => {
  const ctx = await setupTest();

  await ctx.call('gmail.wake_set', { thread: 'k3x9m2p7qa.18c2f0a9b3d4e5f6' });

  const [rule] = await ctx.readRules();

  expect(rule?.match).toStrictEqual({ thread: '18c2f0a9b3d4e5f6' });
});

test('it takes a bare thread ID of Gmail for the connection that is named', async () => {
  const ctx = await setupTest();

  await ctx.call('gmail.wake_set', { thread: '18c2f0a9b3d4e5f6', connection: 'k3x9m2p7qa' });

  const [rule] = await ctx.readRules();

  expect(rule?.match).toStrictEqual({ thread: '18c2f0a9b3d4e5f6' });
});

test.each([
  ['an expiry under a minute', { expires: '30s' }],
  ['a window past the expiry', { expires: '5m', window: '1h' }],
])('it refuses %s with BAD_DURATION', async (_title, input) => {
  const ctx = await setupTest();
  const outcome = await ctx.call('gmail.wake_set', input);

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('BAD_DURATION'),
  });
});

test('it refuses a target that is no task with UNKNOWN_TASK', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('gmail.wake_set', { wake: 'no-such-task' });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('UNKNOWN_TASK'),
  });
});

test('it wakes the task that the call names', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: ctx.starter.claim,
    name: 'Bank watcher',
    brief: 'Wait for the bank.',
  });

  await ctx.call('gmail.wake_set', { wake: taskID });

  const [rule] = await ctx.readRules();

  expect(rule?.target).toStrictEqual({ kind: 'task', taskID });
});

test('it refuses with TASK_ENDED when the target task ended before the approved call ran', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.taskSeed.doneTask({
    starter: ctx.starter.claim,
    name: 'Bank watcher',
    brief: 'Wait for the bank.',
  });

  const tool = ctx.findAction('gmail.wake_set').tool;

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'gmail.wake_set',
      input: { connection: 'k3x9m2p7qa', wake: taskID, setBy: taskID },
      toolUseID: null,
    },
    ctx.buildContext(),
  );

  const rules = await ctx.readRules();

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'TASK_ENDED' });
  expect(rules).toStrictEqual([]);
});

test('it shows the rule on the approval card of a call', async () => {
  const ctx = await setupTest();

  const fields = await readGmailBodyFields(ctx.deps.log, {
    tool: 'gmail.wake_set',
    thread: null,
    input: { from: ['@bank.example.org'], expires: '3d' },
    callSequence: 1,
  });

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: {},
    sentence: 'Wake the assistant on Gmail mail matching from @bank.example.org, for 3d',
    approveLabel: 'Set wake rule',
  });
});
