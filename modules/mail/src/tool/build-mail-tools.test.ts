import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { formatLinkMark } from '@heynixie/wire';
import { z } from 'zod';
import { parseMail } from '../parse/parse-mail';
import { writeReceivedMail } from '../store/write-received-mail';
import { matchOutsideText, seedReceivedMail, startTestMail } from '../test-utils';
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
    buildSession: (arrivedMails?: readonly string[]) =>
      arrivedMails === undefined
        ? {}
        : {
            session: {
              key: 'session-a',
              invalidatedThrough: 0,
              policy: {
                context: 'conversation' as const,
                definitionID: null,
                turnMessageSequence: null,
                onBehalfOf: [],
                sources: [],
                arrivedMails,
              },
            },
          },
    declarations: buildMailTools(mail.context, mail.html).map((tool) => tool.declaration),
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
        {
          from: matchOutsideText('news@school.example.org'),
          subject: matchOutsideText('Term dates'),
          unread: true,
        },
        {
          from: matchOutsideText('hello@library.example.org'),
          subject: matchOutsideText('Your loan'),
          unread: true,
        },
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
    result: { mails: subjects.map((subject) => ({ subject: matchOutsideText(subject) })) },
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
    result: { mails: [{ subject: matchOutsideText('First') }], next: null },
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
      from: matchOutsideText('hello@library.example.org'),
      to: [matchOutsideText('assistant@nixie.example.org')],
      cc: [],
      subject: matchOutsideText('Your loan'),
      thread: received.threadShortID,
      text: matchOutsideText('Due on Friday.'),
      attachments: [],
    },
    record: {
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

test.each([
  ['mail.read', (message: string) => ({ message })],
  ['mail.list', () => ({})],
])('it stores the result of %s as untrusted content', async (tool, buildInput) => {
  const ctx = await setupTest();
  const received = await ctx.receive('hello@library.example.org', 'Your loan');

  await runToolCall(
    { tool, input: buildInput(received.shortID), toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: [tool],
      model: { model: 'model-a', profile: 'chat-direct' },
    },
    {
      registry: buildToolRegistry(buildMailTools(ctx.context, ctx.html)),
      decide: buildAllowingDecisionPoint(),
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      queue: {
        enqueue: () => Promise.reject(new Error('the mail tools run direct')),
        readOpenRepeat: () => Promise.resolve(null),
        readOpenAsk: () => Promise.resolve(null),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
  });

  expect(records.map((entry) => entry.record.contentSource)).toStrictEqual(['untrusted']);
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
  ['an expiry past the last date', { expires: '100000000d' }],
  ['a window past the last date', { window: '100000000d', expires: '5m' }],
  ['a window under a minute', { window: '10s' }],
  ['a window past the expiry', { expires: '5m', window: '10m' }],
  ['text that is no duration', { expires: 'soon' }],
])('#mail.wake_set refuses %s', async (_name, input) => {
  const ctx = await setupTest();
  const set = await ctx.callTool('mail.wake_set', input);

  expect(set).toMatchObject({ status: 'error', message: expect.stringContaining('BAD_DURATION') });
});

test('#mail.wake_set takes an expiry past 3650 days', async () => {
  const ctx = await setupTest();
  const set = await ctx.callTool('mail.wake_set', { expires: '3651d' });

  expect(set).toMatchObject({ status: 'ok', result: { rule: expect.any(String) } });
});

test('#mail.wake_set shortens the default window to an expiry under it', async () => {
  const ctx = await setupTest();
  const set = await ctx.callTool('mail.wake_set', { expires: '5m' });
  const listed = await ctx.callTool('mail.wake_list', {});

  expect(set).toMatchObject({ status: 'ok', result: { window: '5m' } });
  expect(listed).toMatchObject({ status: 'ok', result: { rules: [{ window: '5m' }] } });
});

test('#mail.wake_set lists the mail of the last 10 minutes that the rule takes', async () => {
  const ctx = await setupTest();

  await ctx.receive('hello@library.example.org', 'Your code');

  ctx.clock.advance(60_000);

  await ctx.receive('news@school.example.org', 'Term dates');

  const set = await ctx.callTool('mail.wake_set', { from: ['@library.example.org'] });

  expect(set).toMatchObject({
    status: 'ok',
    result: {
      recent: [
        {
          from: matchOutsideText('hello@library.example.org'),
          subject: matchOutsideText('Your code'),
        },
      ],
    },
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

test('#mail.reply names the sender of the mail that woke the turn as the reply target', async () => {
  const ctx = await setupTest();
  const received = await ctx.receive('hello@library.example.org', 'Your loan');

  const resolved = await ctx.resolveDestinations(
    'mail.reply',
    { message: received.shortID },
    ctx.buildSession([received.shortID]),
  );

  expect(resolved).toStrictEqual({
    status: 'ok',
    destinations: [{ value: 'hello@library.example.org', replyTarget: true }],
  });
});

test.each([
  ['another mail woke the turn', ['mnotthismail']],
  ['no mail woke the turn', []],
  ['the call has no session', undefined],
])('#mail.reply names the sender of a mail as no reply target when %s', async (_name, arrived) => {
  const ctx = await setupTest();
  const received = await ctx.receive('hello@library.example.org', 'Your loan');

  const run = ctx.buildSession(arrived);

  const resolved = await ctx.resolveDestinations('mail.reply', { message: received.shortID }, run);

  expect(resolved).toStrictEqual({
    status: 'ok',
    destinations: [{ value: 'hello@library.example.org', replyTarget: false }],
  });
});

test('#mail.reply refuses a mail whose sender address cannot go in a header', async () => {
  const ctx = await setupTest();
  const received = await ctx.receive('hello\u0141@library.example.org', 'Your loan');

  const resolved = await ctx.resolveDestinations(
    'mail.reply',
    { message: received.shortID },
    ctx.buildSession([received.shortID]),
  );

  expect(resolved).toMatchObject({
    status: 'error',
    message: expect.stringContaining('BAD_ADDRESS'),
  });
});

test('#mail.read numbers each link of the text as an ID of the session, and numbers it again as the same', async () => {
  const ctx = await setupTest();

  const received = await ctx.receive(
    'hello@library.example.org',
    'Your loan',
    'Renew at https://library.example.org/renew?id=7 or see https://library.example.org/help.',
  );

  const first = await ctx.callTool('mail.read', { message: received.shortID });
  const second = await ctx.callTool('mail.read', { message: received.shortID });

  const text = matchOutsideText(
    'Renew at [L1 · library.example.org/renew] or see [L2 · library.example.org/help].',
  );

  expect([first, second]).toMatchObject([{ result: { text } }, { result: { text } }]);
});

test('it registers every tool of the module, so each result field has a source', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry(buildMailTools(ctx.context, ctx.html));

  expect(registry.toolNames).toStrictEqual([
    'mail.list',
    'mail.read',
    'mail.save_attachment',
    'mail.send',
    'mail.reply',
    'mail.wake_set',
    'mail.wake_list',
    'mail.wake_cancel',
  ]);
});

test('#mail.save_attachment keeps an attachment as a file of the thread, with its bytes beside the result', async () => {
  const ctx = await setupTest();

  const board = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Board',
    text: 'See the board.',
    attachments: [{ name: 'plan.pdf', content: board }],
  });

  const saved = await ctx.callTool('mail.save_attachment', {
    message: received.shortID,
    attachment: 1,
  });

  expect(saved).toMatchObject({
    status: 'ok',
    result: {
      file: expect.stringMatching(/^[a-z0-9]+$/u),
      name: 'plan.pdf',
      bytes: 7,
      mediaType: expect.any(String),
      files: [expect.objectContaining({ path: 'plan.pdf', bytes: 7 })],
    },
    attachments: [board],
  });
});

test.each([
  [
    'an attachment number past the list',
    (message: string) => ({ message, attachment: 2 }),
    'UNKNOWN_ATTACHMENT',
  ],
  [
    'a mail that does not exist',
    () => ({ message: 'mnotamail00', attachment: 1 }),
    'UNKNOWN_MESSAGE',
  ],
])('#mail.save_attachment refuses %s', async (_name, buildInput, code) => {
  const ctx = await setupTest();

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Board',
    text: 'See the board.',
    attachments: [{ name: 'board.png', content: new Uint8Array([1]) }],
  });

  const saved = await ctx.callTool('mail.save_attachment', buildInput(received.shortID));

  expect(saved).toMatchObject({ status: 'error', message: expect.stringContaining(code) });
});

test('#mail.save_attachment refuses an attachment that the mailbox held too much to keep', async () => {
  const ctx = await setupTest();

  const hostMail = ctx.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Big',
    text: 'x',
  });

  const parsed = parseMail(hostMail.raw);

  const received = await writeReceivedMail(ctx.context, hostMail, {
    ...parsed,
    attachments: [{ name: 'huge.bin', bytes: 30_000_000 }],
    attachmentContents: [new Uint8Array()],
  });

  const saved = await ctx.callTool('mail.save_attachment', {
    message: received.shortID,
    attachment: 1,
  });

  expect(saved).toMatchObject({ status: 'error', message: expect.stringContaining('TOO_BIG') });
});

test('#mail.read lists each attachment by its number, name and size', async () => {
  const ctx = await setupTest();

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Board',
    text: 'See the board.',
    attachments: [{ name: 'board.png', content: new Uint8Array(30) }],
  });

  const opened = await ctx.callTool('mail.read', { message: received.shortID });

  expect(opened).toMatchObject({
    status: 'ok',
    record: { attachments: [{ attachment: 1, name: 'board.png', bytes: 30 }] },
  });
});

test('#mail.read reads the HTML of a mail in the fetch sandbox, and numbers each link of it', async () => {
  const ctx = await setupTest();

  const html = '<p>Code <a href="https://library.example.org/code?t=1">here</a></p>';

  ctx.html.answer(html, {
    kind: 'page',
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: `Code here ${formatLinkMark(0)}`,
    links: ['https://library.example.org/code?t=1'],
    isTruncated: false,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  });

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Code',
    text: '',
    html,
  });

  const opened = await ctx.callTool('mail.read', { message: received.shortID });

  expect(opened).toMatchObject({
    status: 'ok',
    record: { text: 'Code here [L1 · library.example.org/code]' },
  });
});

test('#mail.read numbers a link that only the HTML part of a mail holds', async () => {
  const ctx = await setupTest();

  const html = '<p>Reset: <a href="https://library.example.org/reset?t=1">reset</a></p>';

  ctx.html.answer(html, {
    kind: 'page',
    url: 'about:blank',
    status: 200,
    contentType: 'text/html',
    text: `Reset: reset ${formatLinkMark(0)}`,
    links: ['https://library.example.org/reset?t=1'],
    isTruncated: false,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  });

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Reset',
    text: 'Reset your password in your browser.',
    html,
  });

  const opened = await ctx.callTool('mail.read', { message: received.shortID });

  expect(opened).toMatchObject({
    status: 'ok',
    record: { text: 'Reset: reset [L1 · library.example.org/reset]' },
  });
});

test('#mail.read gives the plain text of a mail whose HTML the sandbox cannot read', async () => {
  const ctx = await setupTest();

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Reset',
    text: 'Reset your password in your browser.',
    html: '<p>Unknown to the stand-in.</p>',
  });

  const opened = await ctx.callTool('mail.read', { message: received.shortID });

  expect(opened).toMatchObject({
    status: 'ok',
    record: { text: 'Reset your password in your browser.' },
  });
});

test('#mail.read leaves a mail unread when the sandbox cannot read its HTML', async () => {
  const ctx = await setupTest();

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Code',
    text: '',
    html: '<p>Unknown to the stand-in.</p>',
  });

  const opened = await ctx.callTool('mail.read', { message: received.shortID });
  const listed = await ctx.callTool('mail.list', { unread: true });

  expect(opened).toMatchObject({
    status: 'error',
    message: expect.stringContaining('HTML_UNREADABLE'),
  });

  expect(listed).toMatchObject({ result: { mails: [{ unread: true }] } });
});

test.each([
  ['a file of no thread', { files: ['fnotafile00'] }, 'UNKNOWN_FILE'],
  ['too many files', { files: Array.from({ length: 11 }, () => 'f') }, 'files'],
])('#mail.send refuses %s', async (_name, extra, message) => {
  const ctx = await setupTest();

  const resolved = await ctx.resolveDestinations('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'Plan',
    text: 'See attached.',
    ...extra,
  });

  expect(resolved).toMatchObject({ status: 'error', message: expect.stringContaining(message) });
});

test('#mail.send names each recipient as a destination, and accepts a file of the thread', async () => {
  const ctx = await setupTest();

  const file = ctx.files.addFile({
    thread: 'conversation',
    name: 'plan.txt',
    content: new Uint8Array(Buffer.from('Plan.')),
  });

  const resolved = await ctx.resolveDestinations('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'Plan',
    text: 'See attached.',
    files: [file],
  });

  expect(resolved).toStrictEqual({
    status: 'ok',
    destinations: [{ value: 'hello@library.example.org', replyTarget: false }],
  });
});

test('#mail.send refuses the file of another thread', async () => {
  const ctx = await setupTest();

  const file = ctx.files.addFile({
    thread: 'task-9',
    name: 'plan.txt',
    content: new Uint8Array(Buffer.from('Plan.')),
  });

  const resolved = await ctx.resolveDestinations('mail.send', {
    to: ['hello@library.example.org'],
    subject: 'Plan',
    text: 'See attached.',
    files: [file],
  });

  expect(resolved).toMatchObject({
    status: 'error',
    message: expect.stringContaining('UNKNOWN_FILE'),
  });
});

test.each([
  ['5ms', false],
  ['30s', false],
  ['1m', true],
  ['7d', true],
  ['off', true],
])('#mail.send takes a reply wake of %s: %s', async (replyWake, isAllowed) => {
  const ctx = await setupTest();

  const tool = buildMailTools(ctx.context, ctx.html).find((entry) => entry.name === 'mail.send');
  const replyWakeSchema = z.object({ pattern: z.string() });
  const schema = z.object({ properties: z.object({ replyWake: replyWakeSchema }) });
  const source = schema.parse(tool?.input).properties.replyWake.pattern;

  const pattern = new RegExp(source, 'u');

  expect(pattern.test(replyWake)).toBe(isAllowed);
});

test('#mail.list finds an HTML-only mail by a word of its HTML', async () => {
  const ctx = await setupTest();

  await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Sign in',
    text: '',
    html: '<p>Your code is 482913.</p>',
  });

  const listed = await ctx.callTool('mail.list', { text: '482913' });

  expect(listed).toMatchObject({ status: 'ok', result: { mails: [{ unread: true }] } });
});
