import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildRememberReply } from './test-utils/build-remember-reply';
import { removeMessageKeyAfter } from './test-utils/remove-message-key-after';
import { startTestMemoryWriter } from './test-utils/start-test-memory-writer';
import { startTestServer } from './test-utils/start-test-server';
import { writeOwnerMessages } from './test-utils/write-owner-messages';

// memory and its writer on a test server, which a test starts after it records the messages the
// catch-up covers
async function setupTest() {
  const server = await startTestServer();

  return { memory: await startTestMemoryWriter(server) };
}

test('it ends a catch-up over a changed address with one active item that holds the new address', async () => {
  const ctx = await setupTest();
  const sequences = await writeOwnerMessages(ctx.memory.context.log, [
    'I live at 4 Elm Row.',
    'We moved last week, so I live at 9 Oak Lane now.',
  ]);

  await ctx.memory.start();
  ctx.memory.model.addReplies(
    buildRememberReply({
      text: 'You live at 4 Elm Row.',
      quote: '4 Elm Row',
      sourceID: sequences[0],
    }),
    { text: 'Staged.' },
  );
  await ctx.memory.run({
    isDone: async () => {
      const items = await ctx.memory.listItems();

      return items.length > 0;
    },
  });

  const [first] = await ctx.memory.listItems();

  ctx.memory.model.addReplies(
    buildRememberReply({
      text: 'You live at 9 Oak Lane.',
      quote: 'I live at 9 Oak Lane',
      sourceID: sequences[1],
      itemID: first?.itemID ?? 'no-item',
    }),
    { text: 'Staged.' },
  );
  await ctx.memory.run();

  const items = await ctx.memory.listItems();

  expect(items).toMatchObject([
    { itemID: first?.itemID, version: 2, text: 'You live at 9 Oak Lane.' },
  ]);
}, 60_000);

test('it publishes nothing from a message forgotten while the model extracts from it', async () => {
  const ctx = await setupTest();
  const log = ctx.memory.context.log;
  const [sequence] = await writeOwnerMessages(log, ['My sister is called Robin.']);

  await ctx.memory.start();

  // the first request stages the write, and the forget lands before the session's second
  ctx.memory.model.addReplies(
    buildRememberReply({
      text: 'Your sister is called Robin.',
      quote: 'My sister is called Robin',
      sourceID: sequence,
    }),
    {
      text: 'Staged.',
      gate: removeMessageKeyAfter({ log, model: ctx.memory.model }, { sequence, requests: 2 }),
    },
  );
  await ctx.memory.run();

  const items = await ctx.memory.listItems();
  const entries = await readRecords(log, { afterSequence: 0, thread: 'memory-writer' });

  expect(items).toStrictEqual([]);
  expect(entries.filter((entry) => entry.record.kind === 'memory.batch_published')).toMatchObject([
    { record: { payload: { start: 0, end: sequence, applied: [], proposed: 0, dropped: 1 } } },
    { record: { payload: { applied: [], dropped: 0, catchUpEnded: true } } },
  ]);
}, 60_000);

test('it backs off, doubling each wait, after more failed model calls than the task limit', async () => {
  const ctx = await setupTest();

  await writeOwnerMessages(ctx.memory.context.log, ['I work at the harbour office.']);
  await ctx.memory.start();
  await ctx.memory.run({
    isDone: async () => {
      const status = await ctx.memory.readStatus();

      return status.failures >= 4;
    },
  });

  const status = await ctx.memory.readStatus();

  // the waits run 30 s, 60 s and 120 s from the first failure at 1,000,000 ms, then 240 s
  expect(status).toMatchObject({
    failures: 4,
    retryAt: 1_450_000,
    lastError: { code: 'batch_failed', at: 1_210_000 },
  });
}, 60_000);

test('it resumes the batch once the model answers after a backoff', async () => {
  const ctx = await setupTest();
  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'I work at the harbour office.',
  ]);

  await ctx.memory.start();
  await ctx.memory.run({
    isDone: async () => {
      const status = await ctx.memory.readStatus();

      return status.failures >= 4;
    },
  });
  ctx.memory.model.addReplies(
    buildRememberReply({
      text: 'You work at the harbour office.',
      quote: 'I work at the harbour office',
      sourceID: sequence,
    }),
    { text: 'Staged.' },
  );
  await ctx.memory.run();

  const items = await ctx.memory.listItems();

  expect(items).toMatchObject([{ text: 'You work at the harbour office.' }]);
}, 60_000);
