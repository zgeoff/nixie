import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readInbox, triggerMailWokeCodec } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { readTestTriggerRows } from '@heynixie/triggers/test-utils';
import { waitFor } from '@zgeoff/testing';
import { startTestPhone, startTestPhoneSource } from '../test-utils';
import { phoneCursorSchema } from './phone-cursor';

async function setupTest() {
  const phone = await startTestPhone();

  const taskSeed = buildTaskSeeder({ context: phone.tasks });

  await taskSeed.conversationStep();

  const readCursor = async () => {
    const rows = await readTestTriggerRows(phone);

    const cursor = rows.sources[0]?.cursor;

    return cursor === null || cursor === undefined
      ? null
      : phoneCursorSchema.parse(JSON.parse(cursor));
  };

  return {
    ...phone,
    startSource: () => startTestPhoneSource(phone),

    // the provider is read again, as it is each poll interval
    poll: () => {
      phone.clock.advance(phone.context.settings.pollIntervalMs);
    },

    // the source commits its cursor with each batch it delivers
    waitForCursor: (since: number) =>
      waitFor(async () => {
        const cursor = await readCursor();

        expect(cursor?.since).toBe(since);
      }),
    readCursor,
    readWakes: async () => {
      const records = await readRecords(phone.tasks.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_woke'],
      });

      return records.map((entry) => entry.record);
    },
    readArrivals: async () => {
      const records = await readRecords(phone.tasks.log, {
        afterSequence: 0,
        kinds: ['trigger.mail_arrived'],
      });

      return records.map((entry) => entry.record);
    },
    readStoredIDs: async () => {
      const outcome = await phone.callTool('phone.list', {});

      return outcome.status === 'ok' ? outcome.result['texts'] : null;
    },
  };
}

test('it stores no text that the provider held before the source first started', async () => {
  const ctx = await setupTest();

  const old = ctx.provider.deliver({ from: 'Example', body: 'Old news' });

  await ctx.startSource();
  await ctx.waitForCursor(old.receivedAt);

  ctx.clock.advance(1000);

  const next = ctx.provider.deliver({ from: 'Example', body: 'New news' });

  ctx.poll();

  await ctx.waitForCursor(next.receivedAt);

  const outcome = await ctx.callTool('phone.list', {});

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { texts: [{ body: expect.stringContaining('New news') }] },
  });

  const texts = outcome.status === 'ok' ? outcome.result['texts'] : null;

  expect(texts).toHaveLength(1);
});

test('it records the cursor of the first start as the provider stands, with no records', async () => {
  const ctx = await setupTest();

  const old = ctx.provider.deliver({ from: 'Example', body: 'Old news' });

  await ctx.startSource();
  await ctx.waitForCursor(old.receivedAt);

  const cursor = await ctx.readCursor();

  const records = await readRecords(ctx.tasks.log, {
    afterSequence: 0,
    kinds: ['phone.text_received'],
  });

  expect(cursor).toStrictEqual({ since: old.receivedAt, skip: [old.messageID] });
  expect(records).toStrictEqual([]);
});

test('it wakes nothing for a text that no wake rule matches, and phone.list still finds it', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);
  await ctx.callTool('phone.wake_set', { from: ['Other'], window: '1m' });

  ctx.clock.advance(1000);

  const text = ctx.provider.deliver({ from: 'Example', body: 'Your code is 5521' });

  ctx.poll();

  await ctx.waitForCursor(text.receivedAt);

  const listed = await ctx.readStoredIDs();
  const wakes = await ctx.readWakes();
  const arrivals = await ctx.readArrivals();
  const inbox = await readInbox(ctx.tasks, 'conversation');
  const rows = await readTestTriggerRows(ctx);

  expect(listed).toHaveLength(1);
  expect([wakes, arrivals, rows.held]).toStrictEqual([[], [], []]);
  expect(inbox.map((record) => record.kind)).not.toContain('trigger.mail_woke');
});

test('it wakes the conversation with a text that a rule matches by body, and the assistant reads it', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);
  await ctx.callTool('phone.wake_set', { from: ['example'], body: 'CODE', window: '1m' });

  ctx.clock.advance(1000);

  const text = ctx.provider.deliver({ from: 'Example', body: 'Your code is 5521' });

  ctx.poll();

  await ctx.waitForCursor(text.receivedAt);

  const [woke] = await ctx.readWakes();
  const inbox = await readInbox(ctx.tasks, 'conversation');

  expect(inbox.map((record) => record.kind)).toContain('trigger.mail_woke');

  expect(woke?.erasable).toMatchObject({
    status: 'readable',
    fields: { mails: [{ from: 'Example', body: 'Your code is 5521' }] },
  });

  const wakePayload = triggerMailWokeCodec.decode(woke?.payload ?? {});
  const shortID = wakePayload.mails[0]?.messageID ?? '';

  const read = await ctx.callTool('phone.read', { text: shortID });

  expect(read).toMatchObject({
    status: 'ok',
    result: { from: 'Example', body: 'Your code is 5521' },
  });
});

test('it stores each text that an outage missed, and wakes only for those received in the last hour', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);
  await ctx.callTool('phone.wake_set', { window: '1m' });

  const setAt = ctx.clock.now();

  ctx.clock.advance(4 * 3_600_000);

  const missed = ctx.provider.deliver({
    from: 'Example',
    body: 'Missed before the outage ended',
    receivedAt: setAt + 30 * 60_000,
  });

  const recent = ctx.provider.deliver({
    from: 'Example',
    body: 'Received a few minutes ago',
    receivedAt: ctx.clock.now() - 5 * 60_000,
  });

  ctx.poll();

  await ctx.waitForCursor(recent.receivedAt);

  const listed = await ctx.readStoredIDs();
  const arrivals = await ctx.readArrivals();
  const [woke] = await ctx.readWakes();

  expect(missed.receivedAt).toBeLessThan(recent.receivedAt);
  expect(listed).toHaveLength(2);
  expect(arrivals).toHaveLength(1);

  expect(woke?.erasable).toMatchObject({
    fields: { mails: [{ body: 'Received a few minutes ago' }] },
  });
});

test('it stores a text once when the provider lists it in 2 reads', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);

  const text = ctx.provider.deliver({ from: 'Example', body: 'Hello' });

  ctx.poll();

  await ctx.waitForCursor(text.receivedAt);

  ctx.poll();
  ctx.poll();

  const listed = await ctx.readStoredIDs();

  expect(listed).toHaveLength(1);
});

test('it logs a failed read, and reads again once the provider answers', async () => {
  const ctx = await setupTest();

  await ctx.startSource();
  await ctx.waitForCursor(0);

  ctx.provider.failNextRead('the provider is down');
  ctx.poll();

  await waitFor(() => {
    expect(ctx.logged.map((entry) => entry.event)).toContain('phone.source_failed');
  });

  const text = ctx.provider.deliver({ from: 'Example', body: 'Back again' });

  ctx.clock.advance(60_000);

  await ctx.waitForCursor(text.receivedAt);
});
