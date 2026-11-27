import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const send = ctx.findAction('gmail.send');

  return {
    ...ctx,
    check: () => {
      const check = send.queued?.check;

      if (check === undefined) {
        throw new Error('gmail.send has no check');
      }

      return check({
        actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
        tool: 'gmail.send',
        arguments: { connection: 'k3x9m2p7qa' },
        attempt: 1,
        snapshotHash: 'sha256:test',
        idempotencyKey: 'key-1',
        destinations: [],
        attemptStartedAt: ctx.clock.now(),
        actionHash: 'hash-1',
        deadlineAt: null,
      });
    },
  };
}

test('it declares a check no sooner than 5 minutes after the attempt that asks the owner when nothing is found', async () => {
  const ctx = await setupTest();

  expect(ctx.findAction('gmail.send').reconcile).toStrictEqual({
    kind: 'check',
    tool: 'gmail.find_sent',
    trustNegativeAfterMs: 300_000,
    onNotFound: 'ask',
  });
});

test('it finds a send by the Message-ID that the action ID makes', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'me@example.test',
    subject: 'Q3',
    text: 'sent',
    labels: ['SENT'],
    messageID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.test',
    sentAtMs: ctx.clock.now(),
  });

  const outcome = await ctx.check();

  expect(outcome).toStrictEqual({
    kind: 'found',
    result: {
      message: `k3x9m2p7qa.${seeded.id}`,
      thread: `k3x9m2p7qa.${seeded.threadID}`,
      replyRule: expect.any(String),
    },
  });
});

test('it finds a send whose Message-ID Gmail replaced and kept in its original header', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'me@example.test',
    subject: 'Q3',
    text: 'sent',
    labels: ['SENT'],
    messageID: 'replaced@mail.google.test',
    sentAtMs: ctx.clock.now(),
  });

  const stored = ctx.site.gmail.messages.get(seeded.id);

  invariant(stored, 'the message is seeded');

  ctx.site.gmail.messages.set(seeded.id, {
    ...stored,
    headers: [
      ...stored.headers,
      ['X-Google-Original-Message-ID', '<0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.test>'],
    ],
  });

  const outcome = await ctx.check();

  expect(outcome).toMatchObject({ kind: 'found' });
});

test('it answers found from the Sent list when the search finds nothing', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.seed({
    from: 'me@example.test',
    subject: 'Q3',
    text: 'sent',
    labels: ['SENT'],
    messageID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.test',
    sentAtMs: ctx.clock.now(),
  });

  ctx.site.gmail.failures.push({ line: 'GET /messages?q=rfc822msgid', status: 500 });

  const outcome = await ctx.check();

  expect(outcome).toMatchObject({ kind: 'found' });
});

test('it answers not found when both ways finish and find none', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.seed({ from: 'me@example.test', subject: 'Other', text: 'x', labels: ['SENT'] });

  const outcome = await ctx.check();

  expect(outcome).toStrictEqual({ kind: 'not_found' });
});

test('it answers inconclusive when a call fails and no message is found', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({ line: 'GET /messages?q=rfc822msgid', status: 500 });

  const outcome = await ctx.check();

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test('it answers inconclusive when the Sent list holds more than 200 messages', async () => {
  const ctx = await setupTest();

  for (let index = 0; index < 205; index += 1) {
    ctx.site.gmail.seed({
      from: 'me@example.test',
      subject: `Mail ${String(index)}`,
      text: 'x',
      labels: ['SENT'],
      sentAtMs: ctx.clock.now() + index,
    });
  }

  const outcome = await ctx.check();

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test('it answers inconclusive when Gmail answers a list the check cannot read', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push(
    { line: 'GET /messages?q=rfc822msgid', status: 200, body: '{"messages":"invalid"}' },
    { line: 'GET /messages?q=after', status: 200, body: '{"messages":"invalid"}' },
  );

  const outcome = await ctx.check();

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test('it answers inconclusive when a listed message is gone by the time the check reads it', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({
    from: 'me@example.test',
    subject: 'Other',
    text: 'x',
    labels: ['SENT'],
    sentAtMs: ctx.clock.now(),
  });

  ctx.site.gmail.failures.push({ line: `GET /messages/${seeded.id}`, status: 404 });

  const outcome = await ctx.check();

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});
