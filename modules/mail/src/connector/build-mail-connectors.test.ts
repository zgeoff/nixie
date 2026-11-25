import { expect, test } from 'bun:test';
import { buildActionSeeder } from '@heynixie/actions/test-utils';
import type { JSONObject } from '@heynixie/log';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readWakeRules } from '@heynixie/triggers';
import { buildOutgoingMail } from '../parse/build-outgoing-mail';
import { parseMail } from '../parse/parse-mail';
import type { MemoryMail } from '../test-utils';
import { seedReceivedMail, startTestMail } from '../test-utils';

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

  await ctx.host.send(
    buildOutgoingMail({
      messageID: `${attempt.actionID}@nixie.example.org`,
      from: 'assistant@nixie.example.org',
      to: ['hello@library.example.org'],
      subject: 'A question',
      text: 'Could you help?',
      references: [],
      sentAt: ctx.clock.now(),
    }),
  );

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
