import { expect, test } from 'bun:test';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { eraseGmailMailbox, readWakeRules } from '@heynixie/triggers';
import { startTestTriggers } from '@heynixie/triggers/test-utils';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';
import type { ActionAttempt } from '../../types';

async function setupTest() {
  const triggers = await startTestTriggers();

  await buildTaskSeeder({ context: triggers.context }).conversationStep();

  const ctx = await startGmailTools({ triggers });

  const buildAttempt = (args: Record<string, string | string[]>): ActionAttempt => ({
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

  const send = (args: Record<string, string | string[]>) => {
    const queued = ctx.findAction('gmail.send').queued;

    invariant(queued, 'gmail.send runs queued');

    return queued.run(buildAttempt(args));
  };

  const check = (args: Record<string, string | string[]>) => {
    const queued = ctx.findAction('gmail.send').queued;

    invariant(queued?.check, 'gmail.send has a check');

    return queued.check(buildAttempt(args));
  };

  const readRules = () =>
    readWakeRules(triggers.writer.db, {
      mailbox: { kind: 'gmail', connectionID: ctx.site.context.connectionID },
      at: ctx.clock.now(),
    });

  return { ...ctx, triggers, send, check, readRules, buildAttempt };
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

test('it leaves the outcome open when the rule cannot be written, and the check of the send writes it', async () => {
  const ctx = await setupTest();

  ctx.site.breakNextLiveProbe();

  const response = await ctx.send({});
  const before = await ctx.readRules();
  const checked = await ctx.check({});
  const [rule] = await ctx.readRules();

  expect([response.kind, before, checked]).toStrictEqual([
    'ambiguous',
    [],
    {
      kind: 'found',
      result: {
        message: expect.any(String),
        thread: expect.any(String),
        replyRule: rule?.shortID ?? '',
      },
    },
  ]);
});

test('it leaves the check inconclusive when the rule cannot be written, so no send is told it had none', async () => {
  const ctx = await setupTest();

  await ctx.send({});

  ctx.site.breakNextLiveProbe();

  const checked = await ctx.check({});

  expect(checked).toStrictEqual({ kind: 'inconclusive' });
});

test('it finds the rule of a send whose outcome stayed open after a restart, and keeps one rule', async () => {
  const ctx = await setupTest();
  const sent = await ctx.send({});
  const restarted = await startGmailTools({ triggers: ctx.triggers, site: ctx.site });

  const queued = restarted.findAction('gmail.send').queued;

  invariant(queued?.check, 'gmail.send has a check');

  const checked = await queued.check(ctx.buildAttempt({}));
  const rules = await ctx.readRules();

  expect(checked).toMatchObject({
    kind: 'found',
    result: { replyRule: sent.kind === 'success' ? sent.result['replyRule'] : '' },
  });

  expect(rules).toHaveLength(1);
});

test('it writes no second rule when the check of a send runs after its reply rule expired', async () => {
  const ctx = await setupTest();

  const sentAt = ctx.clock.now();

  await ctx.send({ replyWake: '1m' });

  ctx.clock.advance(5 * 60_000);

  const queued = ctx.findAction('gmail.send').queued;

  invariant(queued?.check, 'gmail.send has a check');

  const checked = await queued.check({
    ...ctx.buildAttempt({ replyWake: '1m' }),
    attemptStartedAt: sentAt,
  });

  const rules = await readWakeRules(ctx.triggers.writer.db, {
    mailbox: { kind: 'gmail', connectionID: ctx.site.context.connectionID },
    at: sentAt,
  });

  expect(checked).toMatchObject({ kind: 'found', result: { replyRule: null } });
  expect(rules).toHaveLength(1);
});

test('it writes no rule for a connection that was forgotten after the send read it', async () => {
  const ctx = await setupTest();

  const connectionID = ctx.site.context.connectionID;
  const hold = ctx.site.holdLiveRead();
  const sending = ctx.send({});

  await hold.reached;

  ctx.site.forget(connectionID);

  await eraseGmailMailbox(ctx.deps.wake.context(), connectionID);

  hold.release();

  const response = await sending;
  const rules = await ctx.readRules();

  expect([response, rules]).toMatchObject([{ kind: 'success', result: { replyRule: null } }, []]);
});
