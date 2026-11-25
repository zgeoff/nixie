import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readInbox } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { buildMockToolCall, buildMockToolContext } from '@heynixie/tools/test-utils';
import { startTriggerSources } from '@heynixie/triggers';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import { z } from 'zod';
import { readMailPage } from '../store/read-mail-page';
import {
  buildMemoryMailHost,
  buildTestWebFetch,
  matchOutsideText,
  startTestMail,
  startTestMailSource,
  testMailAddress,
} from '../test-utils';
import { buildMailSource } from './build-mail-source';

async function setupTest() {
  const mail = await startTestMail();

  const taskSeed = buildTaskSeeder({ context: mail.tasks });

  await taskSeed.conversationStep();

  const readCursorCount = async () => {
    const cursorSchema = z.object({ count: z.int() });

    const rows = await readTestTriggerRows(mail);

    const cursor = rows.sources[0]?.cursor;

    return cursor === null || cursor === undefined
      ? null
      : cursorSchema.parse(JSON.parse(cursor)).count;
  };

  return {
    ...mail,
    taskSeed,
    startSource: () => startTestMailSource(mail),

    // the host is read again, as it is each poll interval
    poll: () => mail.clock.advance(mail.context.settings.hostPollIntervalMs),
    readStored: () => readMailPage(mail.context, { limit: 50 }),

    // the source commits its cursor with each batch it delivers, so a cursor at the count of the
    // host's mail means the source finished delivering that mail
    waitForCursor: (count: number) =>
      waitFor(async () => {
        const current = await readCursorCount();

        expect(current).toBe(count);
      }),
    readWakes: async () => {
      const records = await readRecords(mail.tasks.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_woke'],
      });

      return records.map((entry) => entry.record);
    },
    readArrivals: async () => {
      const records = await readRecords(mail.tasks.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_arrived'],
      });

      return records.map((entry) => entry.record);
    },
  };
}

test('it stores no mail that the host held before the source first started', async () => {
  const ctx = await setupTest();

  ctx.host.deliver({ from: 'hello@library.example.org', subject: 'Old news', text: 'Old.' });

  await ctx.startSource();
  await ctx.waitForCursor(1);

  ctx.host.deliver({ from: 'hello@library.example.org', subject: 'New news', text: 'New.' });
  ctx.poll();

  await ctx.waitForCursor(2);

  const stored = await ctx.readStored();

  expect(stored.mails.map((entry) => entry.subject)).toStrictEqual(['New news']);
});

test('it wakes nothing for a mail that no wake rule matches, though a rule on other mail is set', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);
  await ctx.callTool('mail.wake_set', { from: ['@school.example.org'], window: '1m' });

  ctx.clock.advance(1000);

  ctx.host.deliver({
    from: 'hello@library.example.org',
    subject: 'Your sign-in code',
    text: 'Your code is 482913.',
  });

  ctx.poll();

  await ctx.waitForCursor(1);

  const stored = await ctx.readStored();
  const wakes = await ctx.readWakes();
  const arrivals = await ctx.readArrivals();
  const inbox = await readInbox(ctx.tasks, 'conversation');
  const rows = await readTestTriggerRows(ctx);

  expect(stored.mails.map((entry) => entry.subject)).toStrictEqual(['Your sign-in code']);
  expect([wakes, arrivals, rows.held]).toStrictEqual([[], [], []]);
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
  expect(wakes[0]?.contentSource).toBe('untrusted');

  expect(wakes[0]?.erasable).toMatchObject({
    status: 'readable',
    fields: { mails: [{ from: 'hello@library.example.org', subject: 'Your sign-in code' }] },
  });

  expect(listed).toMatchObject({
    status: 'ok',
    result: {
      mails: [
        {
          from: matchOutsideText('hello@library.example.org'),
          subject: matchOutsideText('Your sign-in code'),
        },
      ],
    },
  });
});

test('it lets the assistant open the reset link of a mail that a rule woke it for', async () => {
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

  await waitFor(async () => {
    const wakes = await ctx.readWakes();

    expect(wakes).toHaveLength(1);
  });

  const stored = await ctx.readStored();
  const opened = await ctx.callTool('mail.read', { message: stored.mails[0]?.message });

  const webFetch = buildTestWebFetch(
    ctx,
    new Map([['https://library.example.org/reset?token=t0k3n', 'Choose a new password.']]),
  );

  const fetched = await webFetch.run(
    buildMockToolCall({ tool: 'web_fetch', input: { link: 'L1' } }),
    buildMockToolContext({
      run: { tools: ['web_fetch'], session: { key: 'test-session', invalidatedThrough: 0 } },
    }),
  );

  expect(opened).toMatchObject({
    status: 'ok',
    result: {
      text: matchOutsideText('Tap Reset password ([L1 · library.example.org/reset]).'),
    },
  });

  expect(fetched).toMatchObject({
    status: 'ok',
    result: {
      url: 'https://library.example.org/reset?token=t0k3n',
      status: 200,
      text: 'Choose a new password.',
    },
  });
});

test('it stores the mail of a host that started again, which the earlier cursor does not cover', async () => {
  const ctx = await setupTest();
  const first = await startTriggerSources([ctx.source], ctx.core);

  await ctx.waitForCursor(0);

  ctx.host.deliver({ from: 'hello@library.example.org', subject: 'First', text: 'First.' });

  await ctx.waitForCursor(1);
  await first.stop();

  const restarted = buildMemoryMailHost({ address: testMailAddress, now: () => ctx.clock.now() });

  const sources = await startTriggerSources([buildMailSource(ctx.context, restarted)], ctx.core);

  onTestFinished(() => sources.stop());

  await ctx.waitForCursor(0);

  restarted.deliver({ from: 'hello@library.example.org', subject: 'Second', text: 'Second.' });

  const stored = await waitFor(async () => {
    ctx.poll();

    const page = await ctx.readStored();

    expect(page.mails).toHaveLength(2);

    return page;
  });

  expect(stored.mails.map((entry) => entry.subject)).toStrictEqual(['Second', 'First']);
});

test('it waits a minute after a first failed read that names no retry time, then doubles the wait', async () => {
  const ctx = await setupTest();

  for (const attempt of [1, 2, 3]) {
    ctx.host.failNextRead(`the host refused read ${String(attempt)}`);
  }

  await ctx.startSource();

  const failed = await waitFor(() => {
    ctx.clock.advance(60_000);

    const entries = ctx.logged.filter((entry) => entry.event === 'mail.host_read_failed');

    expect(entries).toHaveLength(3);

    return entries;
  });

  expect(
    failed.map((entry) => z.object({ retryInMs: z.number() }).parse(entry.fields)),
  ).toStrictEqual([{ retryInMs: 60_000 }, { retryInMs: 120_000 }, { retryInMs: 240_000 }]);
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
