import { expect, test } from 'bun:test';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { buildToolRegistry } from '@heynixie/tools';
import { seedReceivedMail, startTestMail } from '../test-utils';
import { buildMailTools } from './build-mail-tools';

async function setupTest() {
  const mail = await startTestMail();

  const taskSeed = buildTaskSeeder({ context: mail.tasks });

  const starter = await taskSeed.conversationStep();

  return {
    ...mail,
    taskSeed,
    starter,
    receive: (from: string, subject: string, text = 'Hello.') =>
      seedReceivedMail(mail, { from, subject, text }),
    declarations: buildMailTools(mail.context).map((tool) => tool.declaration),
  };
}

test('#mail.list lists the mail newest first with its sender, subject and read state', async () => {
  const ctx = await setupTest();

  await ctx.receive('hello@library.example.org', 'Your loan');

  ctx.clock.advance(1000);

  await ctx.receive('news@school.example.org', 'Term dates');

  const listed = await ctx.callTool('mail.list', {});

  expect(listed).toMatchObject({
    status: 'ok',
    result: {
      mails: [
        { from: 'news@school.example.org', subject: 'Term dates', unread: true },
        { from: 'hello@library.example.org', subject: 'Your loan', unread: true },
      ],
      next: null,
    },
  });
});

test.each([
  ['an address', { from: 'news@school.example.org' }, ['Term dates']],
  ['a domain', { from: '@library.example.org' }, ['Your loan']],
  ['a word of the subject', { text: 'term' }, ['Term dates']],
  ['a word of the text', { text: 'overdue' }, ['Your loan']],
])('#mail.list narrows by %s', async (_name, filter, subjects) => {
  const ctx = await setupTest();

  await ctx.receive('hello@library.example.org', 'Your loan', 'Your book is overdue.');

  ctx.clock.advance(1000);

  await ctx.receive('news@school.example.org', 'Term dates');

  const listed = await ctx.callTool('mail.list', filter);

  expect(listed).toMatchObject({
    status: 'ok',
    result: { mails: subjects.map((subject) => ({ subject })) },
  });
});

test('#mail.list pages with next and before', async () => {
  const ctx = await setupTest();

  await ctx.receive('a@x.example.org', 'First');

  ctx.clock.advance(1000);

  await ctx.receive('a@x.example.org', 'Second');

  ctx.clock.advance(1000);

  await ctx.receive('a@x.example.org', 'Third');

  const first = await ctx.callTool('mail.list', { limit: 2 });

  const next = first.status === 'ok' ? first.result['next'] : null;

  const second = await ctx.callTool('mail.list', { limit: 2, before: next });

  expect(second).toMatchObject({
    status: 'ok',
    result: { mails: [{ subject: 'First' }], next: null },
  });
});

test('#mail.read opens a mail and marks it read', async () => {
  const ctx = await setupTest();
  const received = await ctx.receive('hello@library.example.org', 'Your loan', 'Due on Friday.');
  const opened = await ctx.callTool('mail.read', { message: received.shortID });
  const unread = await ctx.callTool('mail.list', { unread: true });

  expect(opened).toStrictEqual({
    status: 'ok',
    result: {
      from: 'hello@library.example.org',
      to: ['assistant@nixie.example.org'],
      cc: [],
      subject: 'Your loan',
      thread: received.threadShortID,
      text: 'Due on Friday.',
      attachments: [],
    },
  });

  expect(unread).toMatchObject({ status: 'ok', result: { mails: [] } });
});

test('#mail.read refuses a mail that does not exist', async () => {
  const ctx = await setupTest();
  const opened = await ctx.callTool('mail.read', { message: 'mnotamail00' });

  expect(opened).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_MESSAGE: no mail has the ID mnotamail00',
  });
});

test('it marks the sender, subject and text of an incoming mail as outside content', async () => {
  const ctx = await setupTest();

  const sources = ctx.declarations.flatMap((declaration) => Object.entries(declaration.results));

  expect(sources).toStrictEqual(
    expect.arrayContaining([
      ['mails', 'untrusted'],
      ['from', 'untrusted'],
      ['subject', 'untrusted'],
      ['text', 'untrusted'],
    ]),
  );
});

test('#mail.wake_set sets a rule that wakes the caller and stays with no expiry', async () => {
  const ctx = await setupTest();
  const set = await ctx.callTool('mail.wake_set', { from: ['@library.example.org'] });
  const listed = await ctx.callTool('mail.wake_list', {});

  expect(set).toMatchObject({
    status: 'ok',
    result: { expiresAt: null, window: '15m', replaced: false, recent: [] },
  });

  expect(listed).toMatchObject({
    status: 'ok',
    result: {
      rules: [
        {
          match: { from: ['@library.example.org'] },
          wake: 'conversation',
          expiresAt: null,
          origin: 'tool',
        },
      ],
    },
  });
});

test('#mail.wake_set wakes the task that the call names', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: ctx.starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  await ctx.callTool('mail.wake_set', { wake: taskID, subject: 'code', expires: '30m' });

  const listed = await ctx.callTool('mail.wake_list', {});

  expect(listed).toMatchObject({
    status: 'ok',
    result: { rules: [{ wake: taskID, match: { subject: 'code' } }] },
  });
});

test('#mail.wake_set takes the calling task as the target when it names none', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: ctx.starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  await ctx.callTool('mail.wake_set', { subject: 'code' }, taskID);

  const listed = await ctx.callTool('mail.wake_list', {});

  expect(listed).toMatchObject({ status: 'ok', result: { rules: [{ wake: taskID }] } });
});

test('#mail.wake_set refuses a task that has ended and one that never existed', async () => {
  const ctx = await setupTest();

  const doneID = await ctx.taskSeed.doneTask({
    starter: ctx.starter.claim,
    name: 'Library watcher',
    brief: 'Wait for the library code.',
  });

  const ended = await ctx.callTool('mail.wake_set', { wake: doneID });
  const unknown = await ctx.callTool('mail.wake_set', { wake: 'tnotatask00' });

  expect([ended.status, unknown.status]).toStrictEqual(['error', 'error']);
  expect(ended).toMatchObject({ message: expect.stringContaining('UNKNOWN_TASK') });
  expect(unknown).toMatchObject({ message: expect.stringContaining('UNKNOWN_TASK') });
});

test.each([
  ['an expiry under a minute', { expires: '30s' }],
  ['a window under a minute', { window: '10s' }],
  ['a window past the expiry', { expires: '5m', window: '10m' }],
  ['text that is no duration', { expires: 'soon' }],
])('#mail.wake_set refuses %s', async (_name, input) => {
  const ctx = await setupTest();
  const set = await ctx.callTool('mail.wake_set', input);

  expect(set).toMatchObject({ status: 'error', message: expect.stringContaining('BAD_DURATION') });
});

test('#mail.wake_set lists the mail of the last 10 minutes that the rule takes', async () => {
  const ctx = await setupTest();

  await ctx.receive('hello@library.example.org', 'Your code');

  ctx.clock.advance(60_000);

  await ctx.receive('news@school.example.org', 'Term dates');

  const set = await ctx.callTool('mail.wake_set', { from: ['@library.example.org'] });

  expect(set).toMatchObject({
    status: 'ok',
    result: { recent: [{ from: 'hello@library.example.org', subject: 'Your code' }] },
  });
});

test('#mail.wake_set replaces a rule with the same match and target', async () => {
  const ctx = await setupTest();

  await ctx.callTool('mail.wake_set', { subject: 'code', window: '1m' });

  const again = await ctx.callTool('mail.wake_set', { subject: 'code', window: '5m' });
  const listed = await ctx.callTool('mail.wake_list', {});

  expect(again).toMatchObject({ status: 'ok', result: { replaced: true, window: '5m' } });
  expect(listed).toMatchObject({ status: 'ok', result: { rules: [{ window: '5m' }] } });
});

test('#mail.wake_cancel ends a rule, and refuses a rule that is not live', async () => {
  const ctx = await setupTest();
  const set = await ctx.callTool('mail.wake_set', { subject: 'code' });

  const rule = set.status === 'ok' ? (set.result['rule'] ?? null) : null;

  const cancelled = await ctx.callTool('mail.wake_cancel', { rule });
  const listed = await ctx.callTool('mail.wake_list', {});
  const again = await ctx.callTool('mail.wake_cancel', { rule });

  expect(cancelled).toStrictEqual({ status: 'ok', result: { rule, ended: true } });
  expect(listed).toMatchObject({ status: 'ok', result: { rules: [] } });

  expect(again).toMatchObject({
    status: 'error',
    message: expect.stringContaining('UNKNOWN_RULE'),
  });
});

test('it registers every tool of the module, so each result field has a source', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry(buildMailTools(ctx.context));

  expect(registry.toolNames).toStrictEqual([
    'mail.list',
    'mail.read',
    'mail.send',
    'mail.reply',
    'mail.wake_set',
    'mail.wake_list',
    'mail.wake_cancel',
  ]);
});
