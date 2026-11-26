import { expect, test } from 'bun:test';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { startTestTriggers } from '@heynixie/triggers/test-utils';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const triggers = await startTestTriggers();

  await buildTaskSeeder({ context: triggers.context }).conversationStep();

  const ctx = await startGmailTools({ triggers });

  const send = (args: Record<string, string | string[]>) => {
    const queued = ctx.findAction('gmail.send').queued;

    invariant(queued, 'gmail.send runs queued');

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool: 'gmail.send',
      arguments: {
        connection: 'k3x9m2p7qa',
        to: ['sam@example.org'],
        subject: 'Q3 numbers',
        text: 'Hi Sam.',
        ...args,
      },
      attempt: 1,
      idempotencyKey: 'key-1',
      destinations: ['sam@example.org'],
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  const readRules = () =>
    readWakeRules(triggers.writer.db, {
      mailbox: { kind: 'gmail', connectionID: ctx.site.context.connectionID },
      at: ctx.clock.now(),
    });

  return { ...ctx, triggers, send, readRules };
}

test('it wakes the conversation on a reply to a sent mail, for the default expiry', async () => {
  const ctx = await setupTest();
  const response = await ctx.send({});

  const [sent] = ctx.site.gmail.sent;

  const [rule] = await ctx.readRules();

  expect(response).toMatchObject({ kind: 'success', result: { replyRule: rule?.shortID } });

  expect(rule).toMatchObject({
    match: { thread: sent?.threadID },
    target: { kind: 'conversation' },
    origin: 'reply',
    expiresAt: ctx.clock.now() + 7 * 86_400_000,
  });
});

test('it sets the expiry that replyWake names', async () => {
  const ctx = await setupTest();

  await ctx.send({ replyWake: '2d' });

  const [rule] = await ctx.readRules();

  expect(rule?.expiresAt).toBe(ctx.clock.now() + 2 * 86_400_000);
});

test('it registers no rule when replyWake is off', async () => {
  const ctx = await setupTest();
  const response = await ctx.send({ replyWake: 'off' });
  const rules = await ctx.readRules();

  expect(response).toMatchObject({ kind: 'success', result: { replyRule: null } });
  expect(rules).toStrictEqual([]);
});

test('it registers no rule for a draft', async () => {
  const ctx = await setupTest();

  const queued = ctx.findAction('gmail.draft').queued;

  invariant(queued, 'gmail.draft runs queued');

  await queued.run({
    actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
    tool: 'gmail.draft',
    arguments: { connection: 'k3x9m2p7qa', to: ['sam@example.org'], subject: 'Q3', text: 'Hi.' },
    attempt: 1,
    idempotencyKey: 'key-1',
    destinations: [],
    attemptStartedAt: ctx.clock.now(),
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  const rules = await ctx.readRules();

  expect(rules).toStrictEqual([]);
});

test('it refuses a replyWake that is neither off nor a duration from 1m to 3650d', async () => {
  const ctx = await setupTest();

  const prepared = await ctx.findAction('gmail.send').tool.prepare?.(
    {
      connection: 'k3x9m2p7qa',
      to: ['sam@example.org'],
      subject: 'Q3',
      text: 'Hi.',
      replyWake: '9999999d',
    },
    ctx.buildContext(),
  );

  expect(prepared).toMatchObject({
    status: 'error',
    message: expect.stringContaining('BAD_DURATION'),
  });
});

test('it shows the reply rule and its expiry on the card of a send', async () => {
  const ctx = await setupTest();

  const prepared = await ctx
    .findAction('gmail.send')
    .tool.prepare?.(
      { connection: 'k3x9m2p7qa', to: ['sam@example.org'], subject: 'Q3', text: 'Hi.' },
      ctx.buildContext(),
    );

  const card =
    prepared !== undefined && 'attachments' in prepared
      ? new TextDecoder().decode(prepared.attachments?.[0])
      : '';

  expect(JSON.parse(card)).toMatchObject({ replyWake: '7d, the default' });
});
