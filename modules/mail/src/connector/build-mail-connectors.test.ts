import { expect, test } from 'bun:test';
import { buildActionSeeder } from '@heynixie/actions/test-utils';
import type { JSONObject, LogTables } from '@heynixie/log';
import { readRecords, removeRecordKey } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { waitFor } from '@zgeoff/testing';
import invariant from 'tiny-invariant';
import { buildOutgoingMail } from '../parse/build-outgoing-mail';
import { parseMail } from '../parse/parse-mail';
import { readMailPage } from '../store/read-mail-page';
import { readMailRow } from '../store/read-mail-row';
import type { MemoryMail } from '../test-utils';
import { seedReceivedMail, startTestMail, startTestMailSource } from '../test-utils';

async function setupTest() {
  const mail = await startTestMail();

  const taskSeed = buildTaskSeeder({ context: mail.tasks });
  const actionSeed = buildActionSeeder({ context: mail.tasks });

  const starter = await taskSeed.conversationStep();

  return {
    ...mail,
    queueSend: async (tool: string, args: JSONObject) => {
      const action = await actionSeed.action({ step: starter.claim, tool, arguments: args });

      return {
        actionID: action.action_id,
        tool,
        arguments: args,
        attempt: 1,
        idempotencyKey: `key-${action.action_id}`,
        destinations: [],
        actionHash: action.action_hash,
        deadlineAt: null,
      };
    },
    readRules: () =>
      readWakeRules(mail.writer.db, { mailbox: { kind: 'mail' }, at: mail.clock.now() }),
    receive: (incoming: MemoryMail) => seedReceivedMail(mail, incoming),

    // makes the text of a stored mail unreadable, as a forget does
    forget: async (shortID: string) => {
      const row = await readMailRow(mail.context.log, shortID);

      invariant(row !== null, 'the mail is stored');

      const record = await mail.writer.db
        .$extendTables<LogTables>()
        .selectFrom('records')
        .select('key_id')
        .where('sequence', '=', row.record_sequence)
        .executeTakeFirstOrThrow();

      invariant(record.key_id !== null, 'the mail holds a key');

      await removeRecordKey(mail.context.log, record.key_id);
    },
  };
}

test('it sends the mail from the assistant and writes the sent mail with its reply rule', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A question',
    text: 'Could you extend my loan by a week?',
    replyWake: '2d',
  });

  const response = await ctx.connectors.get('mail.send')?.run(attempt);

  const [sent] = ctx.host.readSent();

  const rules = await ctx.readRules();

  expect(response).toMatchObject({ kind: 'success', result: { replyRule: rules[0]?.shortID } });

  expect(parseMail(sent?.raw ?? new Uint8Array())).toMatchObject({
    messageID: `${attempt.actionID}@nixie.example.org`,
    from: 'assistant@nixie.example.org',
    to: ['hello@library.example.org'],
    subject: 'A question',
  });

  expect(rules.map((rule) => [rule.origin, rule.target, rule.expiresAt])).toStrictEqual([
    ['reply', { kind: 'conversation' }, ctx.clock.now() + 2 * 86_400_000],
  ]);
});

test('it registers no reply rule for a send with the reply wake off', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A note',
    text: 'No answer needed.',
    replyWake: 'off',
  });

  const response = await ctx.connectors.get('mail.send')?.run(attempt);
  const rules = await ctx.readRules();

  expect(response).toMatchObject({ kind: 'success', result: { replyRule: null } });
  expect(rules).toStrictEqual([]);
});

test('it refuses a send whose reply wake runs past 3650 days, and sends nothing', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A note',
    text: 'Please answer.',
    replyWake: '3651d',
  });

  const response = await ctx.connectors.get('mail.send')?.run(attempt);

  expect(response).toMatchObject({
    kind: 'refused',
    reason: expect.stringContaining('BAD_DURATION'),
  });

  expect(ctx.host.readSent()).toStrictEqual([]);
});

test('it ends the window of a reply rule at its expiry, when the expiry is shorter than the window', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A note',
    text: 'Please answer.',
    replyWake: '1m',
  });

  await ctx.connectors.get('mail.send')?.run(attempt);

  const rules = await ctx.readRules();

  expect(rules.map((rule) => [rule.windowMs, rule.expiresAt])).toStrictEqual([
    [60_000, ctx.clock.now() + 60_000],
  ]);
});

test('it takes the deployment reply expiry for a send that sets none', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A question',
    text: 'Could you help?',
  });

  await ctx.connectors.get('mail.send')?.run(attempt);

  const rules = await ctx.readRules();

  expect(rules.map((rule) => rule.expiresAt)).toStrictEqual([
    ctx.clock.now() + ctx.context.settings.wake.reply_expiry,
  ]);
});

test('it answers a reply in the thread of the mail it answers, and sets its reply rule there', async () => {
  const ctx = await setupTest();

  const received = await ctx.receive({
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Your loan is due.',
    messageID: 'loan-1@library.example.org',
  });

  const attempt = await ctx.queueSend('mail.reply', {
    message: received.shortID,
    text: 'Thank you, I will return it.',
  });

  const response = await ctx.connectors.get('mail.reply')?.run(attempt);

  const [sent] = ctx.host.readSent();

  const rules = await ctx.readRules();

  expect(response).toMatchObject({ kind: 'success', result: { thread: received.threadShortID } });

  expect(parseMail(sent?.raw ?? new Uint8Array())).toMatchObject({
    to: ['hello@library.example.org'],
    subject: 'Re: Your loan',
    references: ['loan-1@library.example.org', 'loan-1@library.example.org'],
  });

  expect(rules.map((rule) => rule.match)).toStrictEqual([{ thread: received.threadShortID }]);
});

test('it refuses a reply to a mail that does not exist', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.queueSend('mail.reply', { message: 'mnotamail00', text: 'Hello.' });
  const response = await ctx.connectors.get('mail.reply')?.run(attempt);

  expect(response).toStrictEqual({
    kind: 'refused',
    reason: 'UNKNOWN_MESSAGE: no mail has the ID mnotamail00',
  });
});

test('it finds a send at the host by its Message-ID, and writes its record and reply rule once', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A question',
    text: 'Could you help?',
  });

  const mail = buildOutgoingMail({
    messageID: `${attempt.actionID}@nixie.example.org`,
    from: 'assistant@nixie.example.org',
    to: ['hello@library.example.org'],
    subject: 'A question',
    text: 'Could you help?',
    references: [],
    files: [],
    sentAt: ctx.clock.now(),
  });

  invariant(mail !== null, 'the draft is valid');

  await ctx.host.send(mail);

  const first = await ctx.connectors.get('mail.send')?.check?.(attempt);
  const second = await ctx.connectors.get('mail.send')?.check?.(attempt);
  const rules = await ctx.readRules();

  expect(first).toMatchObject({ kind: 'found' });
  expect(second).toStrictEqual(first);
  expect(rules).toHaveLength(1);
});

test('it finds nothing at the host for a send that never went out', async () => {
  const ctx = await setupTest();

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'A question',
    text: 'Could you help?',
  });

  const checked = await ctx.connectors.get('mail.send')?.check?.(attempt);

  expect(checked).toStrictEqual({ kind: 'not_found' });
});

test('it records a send that the host holds, though the mail it answered was forgotten since', async () => {
  const ctx = await setupTest();

  const received = await ctx.receive({
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Your loan is due.',
    messageID: 'loan-1@library.example.org',
  });

  const attempt = await ctx.queueSend('mail.reply', {
    message: received.shortID,
    text: 'Thank you, I will return it.',
  });

  const mail = buildOutgoingMail({
    messageID: `${attempt.actionID}@nixie.example.org`,
    from: 'assistant@nixie.example.org',
    to: ['hello@library.example.org'],
    subject: 'Re: Your loan',
    text: 'Thank you, I will return it.',
    references: ['loan-1@library.example.org'],
    files: [],
    sentAt: ctx.clock.now(),
  });

  invariant(mail !== null, 'the draft is valid');

  await ctx.host.send(mail);
  await ctx.forget(received.shortID);

  const checked = await ctx.connectors.get('mail.reply')?.check?.(attempt);
  const rules = await ctx.readRules();

  expect(checked).toMatchObject({ kind: 'found', result: { thread: received.threadShortID } });
  expect(rules.map((rule) => rule.match)).toStrictEqual([{ thread: received.threadShortID }]);
});

test('it refuses a reply to a mail whose sender address cannot go in a header', async () => {
  const ctx = await setupTest();

  const received = await ctx.receive({
    from: 'helloŁ@library.example.org',
    subject: 'Your loan',
    text: 'Your loan is due.',
  });

  const attempt = await ctx.queueSend('mail.reply', {
    message: received.shortID,
    text: 'Thank you.',
  });

  const response = await ctx.connectors.get('mail.reply')?.run(attempt);

  expect(response).toMatchObject({
    kind: 'refused',
    reason: expect.stringContaining('BAD_ADDRESS'),
  });

  expect(ctx.host.readSent()).toStrictEqual([]);
});

test('it joins a reply that reaches the host during the send to the sent mail, and wakes its sender once', async () => {
  const ctx = await setupTest();

  await startTestMailSource(ctx);

  const received = await ctx.receive({
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Your loan is due.',
    messageID: 'loan-1@library.example.org',
  });

  const attempt = await ctx.queueSend('mail.reply', {
    message: received.shortID,
    text: 'Thank you, I will return it.',
    replyWake: '1d',
  });

  const barrier = ctx.host.replyDuringNextSend(() => ({
    from: 'hello@library.example.org',
    subject: 'Re: Your loan',
    text: 'You are welcome.',
    references: [`${attempt.actionID}@nixie.example.org`],
  }));

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(1);
  });

  const running = ctx.connectors.get('mail.reply')?.run(attempt);

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(0);
  });

  barrier.release();

  await running;

  const wakes = await waitFor(async () => {
    const records = await readRecords(ctx.tasks.log, {
      afterSequence: 0,
      kinds: ['trigger.mail_woke'],
    });

    expect(records).toHaveLength(1);

    return records;
  });

  const page = await readMailPage(ctx.context, { limit: 10 });

  expect(page.mails.map((entry) => [entry.subject, entry.thread])).toStrictEqual([
    ['Re: Your loan', received.threadShortID],
    ['Your loan', received.threadShortID],
  ]);

  expect(wakes[0]?.record.thread).toBe('conversation');
});

test('it stores the sent mail and its reply rule before the source reads a reply, when the host takes the mail and then throws', async () => {
  const ctx = await setupTest();

  await startTestMailSource(ctx);

  const received = await ctx.receive({
    from: 'hello@library.example.org',
    subject: 'Your loan',
    text: 'Your loan is due.',
    messageID: 'loan-1@library.example.org',
  });

  const attempt = await ctx.queueSend('mail.reply', {
    message: received.shortID,
    text: 'Thank you, I will return it.',
    replyWake: '1d',
  });

  const barrier = ctx.host.replyDuringNextSend(() => ({
    from: 'hello@library.example.org',
    subject: 'Re: Your loan',
    text: 'You are welcome.',
    references: [`${attempt.actionID}@nixie.example.org`],
  }));

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(1);
  });

  const running = ctx.connectors.get('mail.reply')?.run(attempt);

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(0);
  });

  barrier.release(new Error('the host dropped the connection'));

  expect(running).rejects.toThrow('the host dropped the connection');

  const wakes = await waitFor(async () => {
    const records = await readRecords(ctx.tasks.log, {
      afterSequence: 0,
      kinds: ['trigger.mail_woke'],
    });

    expect(records).toHaveLength(1);

    return records;
  });

  const page = await readMailPage(ctx.context, { limit: 10 });

  expect(page.mails.map((entry) => [entry.subject, entry.thread])).toStrictEqual([
    ['Re: Your loan', received.threadShortID],
    ['Your loan', received.threadShortID],
  ]);

  expect(wakes[0]?.record.thread).toBe('conversation');
});

test('it sends the files of the thread as attachments, and records each by name and size', async () => {
  const ctx = await setupTest();

  const file = ctx.files.addFile({
    thread: 'conversation',
    name: 'plan.txt',
    content: new Uint8Array(Buffer.from('The plan.')),
  });

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'Plan',
    text: 'See the plan.',
    files: [file],
  });

  const response = await ctx.connectors.get('mail.send')?.run(attempt);

  const [sent] = ctx.host.readSent();
  const parsed = parseMail(sent?.raw ?? new Uint8Array());

  const opened = await ctx.callTool('mail.read', {
    message: response?.kind === 'success' ? response.result['message'] : '',
  });

  expect(response).toMatchObject({ kind: 'success' });
  expect(parsed.text).toBe('See the plan.');
  expect(parsed.attachments).toStrictEqual([{ name: 'plan.txt', bytes: 9 }]);
  expect(Buffer.from(parsed.attachmentContents[0] ?? []).toString('utf8')).toBe('The plan.');

  expect(opened).toMatchObject({
    status: 'ok',
    record: { attachments: [{ attachment: 1, name: 'plan.txt', bytes: 9 }] },
  });
});

test('it refuses a send whose file belongs to another thread, and sends nothing', async () => {
  const ctx = await setupTest();

  const file = ctx.files.addFile({
    thread: 'task-9',
    name: 'plan.txt',
    content: new Uint8Array(Buffer.from('The plan.')),
  });

  const attempt = await ctx.queueSend('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'Plan',
    text: 'See the plan.',
    files: [file],
  });

  const response = await ctx.connectors.get('mail.send')?.run(attempt);

  expect(response).toMatchObject({
    kind: 'refused',
    reason: expect.stringContaining('UNKNOWN_FILE'),
  });

  expect(ctx.host.readSent()).toStrictEqual([]);
});
