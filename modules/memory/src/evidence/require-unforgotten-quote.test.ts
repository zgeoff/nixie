import { expect, test } from 'bun:test';
import { makeGatedCall } from '@heynixie/testing';
import { buildMockCheckerAnswer } from '../test-utils/build-mock-checker-answer';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { seedBegunPurge } from '../test-utils/seed-begun-purge';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';

async function setupTest(verdict: 'asserted' | 'unsure' = 'asserted') {
  const checker = makeGatedCall(() => buildMockCheckerAnswer({ verdict }));

  const memory = await startTestMemory({ gate: { check: checker.call } });

  checker.release();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  return {
    memory,
    checker,
    sequence,
    beginForget: () => seedBegunPurge(memory.log, { recordSequence: sequence, itemIDs: [] }),
  };
}

test('it refuses a remember whose quote names a forgetting record, and writes no item and no proposal', async () => {
  const ctx = await setupTest();

  await ctx.beginForget();

  const write = ctx.memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'QUOTED_RECORD_FORGETTING' });

  const pending = await ctx.memory.store.proposals.listPending();
  const items = await ctx.memory.store.readSubjectCounts();

  const zero = { owner: 0, self: 0, shared: 0 };

  expect(pending).toStrictEqual([]);
  expect(items).toStrictEqual({ items: zero, proposals: zero });
});

test('it refuses a remember that found its quote before the forget began, with no proposal', async () => {
  const checker = makeGatedCall(() => buildMockCheckerAnswer());

  const memory = await startTestMemory({ gate: { check: checker.call } });

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I take my coffee black',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const write = memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  await checker.started;
  await seedBegunPurge(memory.log, { recordSequence: sequence, itemIDs: [] });

  checker.release();

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'QUOTED_RECORD_FORGETTING' });

  const pending = await memory.store.proposals.listPending();

  expect(pending).toStrictEqual([]);
});

test('it refuses an edit whose quote names a forgetting record, and writes no version', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks tea',
    provenance: buildMockProvenance(),
  });

  await ctx.beginForget();

  const write = ctx.memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    target: item,
    caller: buildMockWriteCaller(),
  });

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'QUOTED_RECORD_FORGETTING' });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history?.versions).toHaveLength(1);
});

test('it refuses a retirement whose intent quote names a forgetting record, and keeps the item active', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks coffee',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.recall({ query: 'coffee', thread: 'conversation' });
  await ctx.beginForget();

  const write = ctx.memory.store.writes.retire({
    target: item,
    intentQuote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'QUOTED_RECORD_FORGETTING' });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history?.versions).toHaveLength(1);
  expect(history?.versions[0]?.state).toBe('active');
});

test('it refuses a write that goes to review when its quote names a forgetting record, and writes no proposal', async () => {
  const ctx = await setupTest('unsure');

  await ctx.beginForget();

  const write = ctx.memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  const error = await write.catch((error_: unknown) => error_);

  expect(error).toMatchObject({ code: 'QUOTED_RECORD_FORGETTING' });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(pending).toStrictEqual([]);
});
