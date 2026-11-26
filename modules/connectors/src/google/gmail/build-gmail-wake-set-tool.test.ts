import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { eraseGmailMailbox, readWakeRules } from '@heynixie/triggers';
import { startTestTriggers } from '@heynixie/triggers/test-utils';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { startGmailTools } from '../../test-utils/start-gmail-tools';
import { readGmailBodyFields } from './read-gmail-body-fields';

async function setupTest() {
  const triggers = await startTestTriggers();

  const taskSeed = buildTaskSeeder({ context: triggers.context });

  const starter = await taskSeed.conversationStep();
  const tools = await startGmailTools({ triggers });

  const resolve = (input: JSONObject) => {
    const tool = tools.findAction('gmail.wake_set').tool;

    return tool.resolveInput?.(input, tools.buildContext());
  };

  const attempt = (args: JSONObject) => {
    const queued = tools.findAction('gmail.wake_set').queued;

    invariant(queued, 'gmail.wake_set runs queued');

    return queued.run({
      actionID: '5d1e7b2a-93c4-4a0e-8f16-2b7c0d4e9a31',
      tool: 'gmail.wake_set',
      arguments: args,
      attempt: 1,
      idempotencyKey: 'key-1',
      destinations: [],
      attemptStartedAt: tools.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
      snapshotHash: 'sha256:test',
    });
  };

  // the call as the turn makes it: the host resolves the input, and the run takes the resolved one
  const setRule = async (input: JSONObject) => {
    const resolved = await resolve(input);

    invariant(resolved?.status === 'ok', 'the input resolves');

    return attempt(resolved.input);
  };

  const readRules = (connectionID = tools.site.context.connectionID) =>
    readWakeRules(triggers.writer.db, {
      mailbox: { kind: 'gmail', connectionID },
      at: triggers.clock.now(),
    });

  return { ...tools, triggers, taskSeed, starter, resolve, attempt, setRule, readRules };
}

test('it sets a wake rule on the connection, starting now and expiring from now', async () => {
  const ctx = await setupTest();

  const response = await ctx.setRule({
    from: ['@bank.example.org'],
    expires: '3d',
    window: '1h',
  });

  const [rule] = await ctx.readRules();

  expect(response).toStrictEqual({
    kind: 'success',
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

test('it takes an expiry past 3650 days', async () => {
  const ctx = await setupTest();
  const response = await ctx.setRule({ subject: 'invoice', expires: '3651d' });

  expect(response).toMatchObject({
    kind: 'success',
    result: { expiresAt: new Date(ctx.clock.now() + 3651 * 86_400_000).toISOString() },
  });
});

test('it takes an expiry of 8 digits that the tool schema admits', async () => {
  const ctx = await setupTest();

  const input = ctx.findAction('gmail.wake_set').tool.input;
  const expires = z.object({ pattern: z.string() });
  const schema = z.object({ properties: z.object({ expires }) }).parse(input);

  const response = await ctx.setRule({ subject: 'invoice', expires: '10000000m' });

  const pattern = new RegExp(schema.properties.expires.pattern, 'u');

  const isAdmitted = pattern.test('10000000m');

  expect([isAdmitted, response]).toMatchObject([
    true,
    {
      kind: 'success',
      result: { expiresAt: new Date(ctx.clock.now() + 10_000_000 * 60_000).toISOString() },
    },
  ]);
});

test('it replaces a live rule that has the same match and target, and says so', async () => {
  const ctx = await setupTest();
  const first = await ctx.setRule({ subject: 'invoice', expires: '1d' });
  const second = await ctx.setRule({ subject: 'invoice', expires: '2d' });
  const rules = await ctx.readRules();

  expect(first).toMatchObject({ kind: 'success', result: { replaced: false } });
  expect(second).toMatchObject({ kind: 'success', result: { replaced: true } });
  expect(rules).toHaveLength(1);
});

test('it takes the connection from the prefix of a thread ID and stores Gmail’s own thread ID', async () => {
  const ctx = await setupTest();

  await ctx.setRule({ thread: 'k3x9m2p7qa.18c2f0a9b3d4e5f6' });

  const [rule] = await ctx.readRules();

  expect(rule?.match).toStrictEqual({ thread: '18c2f0a9b3d4e5f6' });
});

test('it takes a bare thread ID of Gmail for the connection that is named', async () => {
  const ctx = await setupTest();

  await ctx.setRule({ thread: '18c2f0a9b3d4e5f6', connection: 'k3x9m2p7qa' });

  const [rule] = await ctx.readRules();

  expect(rule?.match).toStrictEqual({ thread: '18c2f0a9b3d4e5f6' });
});

test.each([
  ['an expiry under a minute', { expires: '30s' }],
  ['a window past the expiry', { expires: '5m', window: '1h' }],
])('it refuses %s with BAD_DURATION', async (_title, input) => {
  const ctx = await setupTest();
  const resolved = await ctx.resolve(input);

  expect(resolved).toMatchObject({
    status: 'error',
    message: expect.stringContaining('BAD_DURATION'),
  });
});

test('it refuses a target that is no task with UNKNOWN_TASK', async () => {
  const ctx = await setupTest();
  const resolved = await ctx.resolve({ wake: 'no-such-task' });

  expect(resolved).toMatchObject({
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

  await ctx.setRule({ wake: taskID });

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

  const response = await ctx.attempt({ connection: 'k3x9m2p7qa', wake: taskID, setBy: taskID });
  const rules = await ctx.readRules();

  expect([response, rules]).toMatchObject([
    { kind: 'refused', reason: expect.stringContaining('TASK_ENDED') },
    [],
  ]);
});

test('it refuses an account that the poll does not read, and writes no rule', async () => {
  const ctx = await setupTest();

  ctx.site.addConnection('zz9y8x7w6v', { isPolled: false });

  const resolved = await ctx.resolve({ subject: 'invoice', connection: 'zz9y8x7w6v' });
  const named = await ctx.readRules('zz9y8x7w6v-id');
  const first = await ctx.readRules();

  expect([resolved, named, first]).toStrictEqual([
    { status: 'error', message: expect.stringContaining('NOT_POLLED') },
    [],
    [],
  ]);
});

test('it writes no rule for a connection that was forgotten after the call read it', async () => {
  const ctx = await setupTest();

  const connectionID = ctx.site.context.connectionID;
  const hold = ctx.site.holdLiveRead();

  const attempting = ctx.attempt({
    connection: 'k3x9m2p7qa',
    wake: 'conversation',
    setBy: 'conversation',
    subject: 'invoice',
  });

  await hold.reached;

  ctx.site.forget(connectionID);

  await eraseGmailMailbox(ctx.deps.wake.context(), connectionID);

  hold.release();

  const response = await attempting;
  const rules = await ctx.readRules();

  expect([response, rules]).toStrictEqual([
    { kind: 'refused', reason: 'connection_forgotten' },
    [],
  ]);
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
