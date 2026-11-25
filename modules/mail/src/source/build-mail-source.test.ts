import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readInbox } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import { readMailPage } from '../store/read-mail-page';
import { startTestMail, startTestMailSource } from '../test-utils';

async function setupTest() {
  const mail = await startTestMail();

  const taskSeed = buildTaskSeeder({ context: mail.tasks });

  await taskSeed.conversationStep();

  return {
    ...mail,
    taskSeed,
    startSource: () => startTestMailSource(mail),

    // the host is read again, as it is each poll interval
    poll: () => mail.clock.advance(mail.context.settings.hostPollIntervalMs),
    readStored: () => readMailPage(mail.context, { limit: 50 }),
    readWakes: async () => {
      const records = await readRecords(mail.tasks.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_woke'],
      });

      return records.map((entry) => entry.record);
    },
  };
}

test('it stores no mail that the host held before the source first started', async () => {
  const ctx = await setupTest();

  ctx.host.deliver({ from: 'hello@library.example.org', subject: 'Old news', text: 'Old.' });

  await ctx.startSource();

  await waitFor(async () => {
    const rows = await readTestTriggerRows(ctx);

    expect(rows.sources).toHaveLength(1);
  });

  ctx.host.deliver({ from: 'hello@library.example.org', subject: 'New news', text: 'New.' });
  ctx.poll();

  const stored = await waitFor(async () => {
    const page = await ctx.readStored();

    expect(page.mails).toHaveLength(1);

    return page;
  });

  expect(stored.mails.map((entry) => entry.subject)).toStrictEqual(['New news']);
});

test('it wakes nothing for a mail that no wake rule matches', async () => {
  const ctx = await setupTest();

  await ctx.startSource();

  ctx.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Your sign-in code',
    text: 'Your code is 482913.',
  });

  ctx.poll();

  const stored = await waitFor(async () => {
    const page = await ctx.readStored();

    expect(page.mails).toHaveLength(1);

    return page;
  });

  const wakes = await ctx.readWakes();
  const inbox = await readInbox(ctx.tasks, 'conversation');

  expect(stored.mails.map((entry) => entry.subject)).toStrictEqual(['Your sign-in code']);
  expect(wakes).toStrictEqual([]);
  expect(inbox.map((record) => record.kind)).not.toContain('trigger.mail_woke');
});

test('it wakes the conversation with a mail that a rule matches, and the assistant reads it', async () => {
  const ctx = await setupTest();

  await ctx.startSource();

  const rule = await ctx.callTool('mail.wake_set', {
    from: ['@library.example.org'],
    expires: '30m',
    window: '1m',
  });

  ctx.clock.advance(1000);

  ctx.host.deliver({
    from: 'Library <hello@library.example.org>',
    subject: 'Your sign-in code',
    text: 'Your code is 482913.',
  });

  ctx.poll();

  const wakes = await waitFor(async () => {
    const records = await ctx.readWakes();

    expect(records).toHaveLength(1);

    return records;
  });

  const listed = await ctx.callTool('mail.list', { unread: true });

  expect(rule.status).toBe('ok');
  expect(wakes[0]?.thread).toBe('conversation');

  expect(wakes[0]?.erasable).toMatchObject({
    status: 'readable',
    fields: { mails: [{ from: 'hello@library.example.org', subject: 'Your sign-in code' }] },
  });

  expect(listed).toMatchObject({
    status: 'ok',
    result: { mails: [{ from: 'hello@library.example.org', subject: 'Your sign-in code' }] },
  });
});

test('it lets the assistant open a reset link that arrived in the inbox', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.callTool('mail.wake_set', { from: ['@library.example.org'], window: '1m' });

  ctx.clock.advance(1000);

  ctx.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Reset your password',
    text: '',
    html: '<p>Tap <a href="https://library.example.org/reset?token=t0k3n">Reset password</a>.</p>',
  });

  ctx.poll();

  const stored = await waitFor(async () => {
    const page = await ctx.readStored();

    expect(page.mails).toHaveLength(1);

    return page;
  });

  const message = stored.mails[0]?.message;

  const opened = await ctx.callTool('mail.read', { message });

  expect(opened).toMatchObject({
    status: 'ok',
    result: {
      subject: 'Reset your password',
      text: 'Tap Reset password (https://library.example.org/reset?token=t0k3n).',
    },
  });
});

test('it reports itself unhealthy after 3 failed reads in a row', async () => {
  const ctx = await setupTest();

  for (const attempt of [1, 2, 3]) {
    ctx.host.failNextRead(`the host refused read ${String(attempt)}`, 1000);
  }

  await ctx.startSource();

  await waitFor(() => {
    const failed = ctx.logged.filter((entry) => entry.event === 'mail.host_read_failed');

    expect(failed).toHaveLength(1);
  });

  ctx.clock.advance(1000);

  await waitFor(() => {
    const failed = ctx.logged.filter((entry) => entry.event === 'mail.host_read_failed');

    expect(failed).toHaveLength(2);
  });

  ctx.clock.advance(1000);

  const health = await waitFor(() => {
    const changes = ctx.logged.filter((entry) => entry.event === 'trigger_source.health');

    expect(changes.map((change) => change.fields)).toStrictEqual([
      { source: 'mail', health: 'unhealthy' },
    ]);

    return changes;
  });

  expect(health).toHaveLength(1);
});

test('it reads the host at once when the host gives a hint', async () => {
  const ctx = await setupTest();

  await ctx.startSource();

  ctx.poll();
  ctx.host.deliver({ from: 'hello@library.example.org', subject: 'Hint', text: 'Hello.' });

  const stored = await waitFor(async () => {
    const page = await ctx.readStored();

    expect(page.mails).toHaveLength(1);

    return page;
  });

  expect(stored.mails).toHaveLength(1);
});
