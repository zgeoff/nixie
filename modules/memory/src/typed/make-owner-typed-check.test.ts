import { expect, test } from 'bun:test';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { writeOwnerMessages } from '../test-utils/write-owner-messages';
import { makeOwnerTypedCheck } from './make-owner-typed-check';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    url: 'https://docs.example.test/guide?page=2',
    memory,
    isOwnerTyped: makeOwnerTypedCheck(memory.log),
    run: buildMockToolContext({ thread: 'conversation' }).run,
  };
}

test('it counts a URL that sits in a typed span of a message', async () => {
  const ctx = await setupTest();

  const text = `please read ${ctx.url} for me`;

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text,
    spans: [{ start: 0, end: text.length, source: 'typed' }],
  });

  const isTyped = await ctx.isOwnerTyped(ctx.run, ctx.url);

  expect(isTyped).toBe(true);
});

test('it does not count a URL that sits in a pasted span', async () => {
  const ctx = await setupTest();

  const text = `please read ${ctx.url} for me`;

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text,
    spans: [
      { start: 0, end: 12, source: 'typed' },
      { start: 12, end: 12 + ctx.url.length, source: 'pasted' },
      { start: 12 + ctx.url.length, end: text.length, source: 'typed' },
    ],
  });

  const isTyped = await ctx.isOwnerTyped(ctx.run, ctx.url);

  expect(isTyped).toBe(false);
});

test('it does not count a URL that a typed span holds only in part', async () => {
  const ctx = await setupTest();

  const text = `please read ${ctx.url} for me`;

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text,
    spans: [{ start: 0, end: 30, source: 'typed' }],
  });

  const isTyped = await ctx.isOwnerTyped(ctx.run, ctx.url);

  expect(isTyped).toBe(false);
});

test('it does not count a message that a forget erased', async () => {
  const ctx = await setupTest();

  const text = `please read ${ctx.url} for me`;

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text,
    spans: [{ start: 0, end: text.length, source: 'typed' }],
  });

  await removeTestRecordKey(ctx.memory.log, sequence);

  const isTyped = await ctx.isOwnerTyped(ctx.run, ctx.url);

  expect(isTyped).toBe(false);
});

test('it does not count a message older than the newest 50', async () => {
  const ctx = await setupTest();

  const text = `please read ${ctx.url} for me`;

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text,
    spans: [{ start: 0, end: text.length, source: 'typed' }],
  });

  await writeOwnerMessages(
    ctx.memory.log,
    Array.from({ length: 50 }, (_, index) => `an unrelated note number ${String(index)}`),
  );

  const isTyped = await ctx.isOwnerTyped(ctx.run, ctx.url);

  expect(isTyped).toBe(false);
});

test('it does not count a message of another thread', async () => {
  const ctx = await setupTest();

  const text = `please read ${ctx.url} for me`;

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'other-thread',
    text,
    spans: [{ start: 0, end: text.length, source: 'typed' }],
  });

  const isTyped = await ctx.isOwnerTyped(ctx.run, ctx.url);

  expect(isTyped).toBe(false);
});
