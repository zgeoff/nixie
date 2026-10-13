import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readMemoryChangeNote } from '@heynixie/memory';
import { writeInboxRecords } from '@heynixie/tasks';
import { buildRememberReply } from './test-utils/build-remember-reply';
import { removeMessageKeyAfter } from './test-utils/remove-message-key-after';
import { startTestConversation } from './test-utils/start-test-conversation';
import type { TestMemoryWriterOptions } from './test-utils/start-test-memory-writer';
import { startTestMemoryWriter } from './test-utils/start-test-memory-writer';
import { startTestServer } from './test-utils/start-test-server';
import { writeOwnerMessages } from './test-utils/write-owner-messages';

// memory and its writer on a test server, which a test starts after it records the messages the
// catch-up covers; a test that passes a checker wires the store's batch gate
async function setupTest(options: TestMemoryWriterOptions = {}) {
  const server = await startTestServer();

  return { server, memory: await startTestMemoryWriter(server, options) };
}

test('it carries the note of a live batch, cut to its cap, on the next conversation turn', async () => {
  const ctx = await setupTest();
  const conversation = await startTestConversation(ctx.server, {
    context: ctx.memory.context,
    readTurnNote: () => readMemoryChangeNote(ctx.memory.context.log, ctx.memory.store, 5),
  });

  await ctx.memory.start();

  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'My pets are Ash, Birch, Cedar, Dune, Elm and Fern.',
  ]);

  ctx.memory.model.addReplies(
    ...['Ash', 'Birch', 'Cedar', 'Dune', 'Elm', 'Fern'].map((name) =>
      buildRememberReply({
        text: `You have a pet called ${name}.`,
        quote: name,
        sourceID: sequence,
      }),
    ),
    { text: 'Staged.' },
    { text: 'Nothing to remember.' },
  );
  conversation.model.addReplies({ text: 'Hello.' });
  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });
  await writeInboxRecords(ctx.memory.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);
  await ctx.memory.run({ steps: { conversation: conversation.runner.runStep } });

  expect(JSON.stringify(conversation.model.requests.at(-1)?.body?.messages)).toMatch(
    /(?<listed>- Remembered \[[^\]]+\]: You have a pet called \w+\.\\n){5}and 1 more\\n<\/memory-changes>\\n\\nHi\./u,
  );
}, 60_000);

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

test('it closes the writer tool socket when the writer fails to start', async () => {
  const ctx = await setupTest();

  // the writer's start reads the definitions snapshot after its tool endpoint opens the run socket
  const starting = ctx.memory.start({
    context: {
      ...ctx.memory.context,
      definitions: () => {
        throw new Error('the definitions snapshot is unreadable');
      },
    },
  });

  expect(starting).rejects.toThrow('the definitions snapshot is unreadable');
  expect(ctx.memory.listSocketNames()).resolves.toStrictEqual([]);
});

test('it applies a staged fact that the store gate confirms against the message it cites', async () => {
  const check = mock(() =>
    Promise.resolve({
      verdict: 'asserted' as const,
      reason: 'Stated.',
      model: 'claude-checker-1',
      failure: null,
    }),
  );
  const ctx = await setupTest({ check });
  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'By the way, my sister Ada lives in Leeds.',
  ]);

  await ctx.memory.start();
  ctx.memory.model.addReplies(
    buildRememberReply({
      text: 'Your sister Ada lives in Leeds.',
      quote: 'my sister Ada lives in Leeds',
      sourceID: sequence,
    }),
    { text: 'Staged.' },
  );
  await ctx.memory.run();

  const entries = await readRecords(ctx.memory.context.log, { afterSequence: 0 });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toBeString(),
    input: expect.toInclude('By the way, «evidence»my sister Ada lives in Leeds«/evidence».'),
  });

  // the evidence is the quote's place in the cited message: characters 12 to 40
  expect(entries.filter((entry) => entry.record.kind === 'memory.version_added')).toMatchObject([
    {
      record: {
        payload: {
          origin: 'memory_writer',
          source: 'owner',
          evidence: { recordSequence: sequence, start: 12, end: 40 },
          checks: { quote: 'pass', tokens: 'pass', checker: { verdict: 'asserted' } },
        },
      },
    },
  ]);
}, 60_000);

test('it publishes a proposal with its batch for a staged fact the checker is unsure of', async () => {
  const ctx = await setupTest({
    check: () =>
      Promise.resolve({
        verdict: 'unsure',
        reason: 'It may be a joke.',
        model: 'claude-checker-1',
        failure: null,
      }),
  });
  const [sequence] = await writeOwnerMessages(ctx.memory.context.log, [
    'Apparently I am the king of Leeds.',
  ]);

  await ctx.memory.start();
  ctx.memory.model.addReplies(
    buildRememberReply({
      text: 'You are the king of Leeds.',
      quote: 'I am the king of Leeds',
      sourceID: sequence,
    }),
    { text: 'Staged.' },
  );
  await ctx.memory.run();

  const pending = await ctx.memory.store.proposals.listPending();
  const entries = await readRecords(ctx.memory.context.log, {
    afterSequence: 0,
    thread: 'memory-writer',
  });

  expect(pending).toMatchObject([
    {
      reason: 'checker_unsure',
      origin: 'memory_writer',
      text: 'You are the king of Leeds.',
      evidence: { recordSequence: sequence, start: 11, end: 33 },
    },
  ]);
  expect(entries.filter((entry) => entry.record.kind === 'memory.batch_published')).toMatchObject([
    { record: { payload: { start: 0, end: sequence, applied: [], proposed: 1 } } },
    { record: { payload: { start: sequence, proposed: 0, catchUpEnded: true } } },
  ]);
}, 60_000);

test('it splits a batch over the proposal cap and publishes each half, so the cursor skips no message', async () => {
  const ctx = await setupTest({
    check: () =>
      Promise.resolve({
        verdict: 'unsure',
        reason: 'Unsure.',
        model: 'claude-checker-1',
        failure: null,
      }),
    writerConfig: { batch_messages: 2, proposal_cap: 1 },
  });
  const [first, second] = await writeOwnerMessages(ctx.memory.context.log, [
    'I might move to Oslo.',
    'I might learn the cello.',
  ]);

  await ctx.memory.start();

  // the whole batch stages 2 proposals, one over the cap, so it splits and runs each half
  ctx.memory.model.addReplies(
    buildRememberReply({ text: 'Might move to Oslo.', quote: 'move to Oslo', sourceID: first }),
    buildRememberReply({ text: 'Might learn cello.', quote: 'learn the cello', sourceID: second }),
    { text: 'Staged.' },
    buildRememberReply({ text: 'Might move to Oslo.', quote: 'move to Oslo', sourceID: first }),
    { text: 'Staged.' },
    buildRememberReply({ text: 'Might learn cello.', quote: 'learn the cello', sourceID: second }),
    { text: 'Staged.' },
  );
  await ctx.memory.run();

  const pending = await ctx.memory.store.proposals.listPending();
  const entries = await readRecords(ctx.memory.context.log, {
    afterSequence: 0,
    thread: 'memory-writer',
  });

  expect(entries.filter((entry) => entry.record.kind === 'memory.batch_published')).toMatchObject([
    { record: { payload: { start: 0, end: first, proposed: 1, dropped: 0 } } },
    { record: { payload: { start: first, end: second, proposed: 1, dropped: 0 } } },
    { record: { payload: { start: second, proposed: 0, catchUpEnded: true } } },
  ]);
  expect(pending.map((proposal) => proposal.evidence?.recordSequence)).toIncludeSameMembers([
    first,
    second,
  ]);
}, 60_000);

test('it leaves no key behind for the proposals of a batch that split', async () => {
  const ctx = await setupTest({
    check: () =>
      Promise.resolve({
        verdict: 'unsure',
        reason: 'Unsure.',
        model: 'claude-checker-1',
        failure: null,
      }),
    writerConfig: { batch_messages: 2, proposal_cap: 1 },
  });
  const [first, second] = await writeOwnerMessages(ctx.memory.context.log, [
    'I might move to Oslo.',
    'I might learn the cello.',
  ]);

  await ctx.memory.start();
  ctx.memory.model.addReplies(
    buildRememberReply({ text: 'Might move to Oslo.', quote: 'move to Oslo', sourceID: first }),
    buildRememberReply({ text: 'Might learn cello.', quote: 'learn the cello', sourceID: second }),
    { text: 'Staged.' },
    buildRememberReply({ text: 'Might move to Oslo.', quote: 'move to Oslo', sourceID: first }),
    { text: 'Staged.' },
    buildRememberReply({ text: 'Might learn cello.', quote: 'learn the cello', sourceID: second }),
    { text: 'Staged.' },
  );
  await ctx.memory.run();

  const pending = await ctx.memory.store.proposals.listPending();
  const keys = await ctx.memory.context.log.writer.keys
    .$extendTables<{ record_keys: { key_id: string } }>()
    .selectFrom('record_keys')
    .select('key_id')
    .execute();
  const recordKeys = await ctx.memory.context.log.writer.db
    .$extendTables<{ records: { key_id: string | null } }>()
    .selectFrom('records')
    .select('key_id')
    .distinct()
    .where('key_id', 'is not', null)
    .execute();

  // every key seals a record or a published proposal
  expect(keys.map((key) => key.key_id)).toIncludeSameMembers([
    ...recordKeys.map((key) => key.key_id),
    ...pending.map((proposal) => proposal.itemID),
  ]);
}, 60_000);
