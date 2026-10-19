import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildMockCheckerAnswer, buildMockWriteCaller, startTestMemory } from './test-utils';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { removeMessageKey } from './test-utils/remove-message-key';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

test('it returns a past message that matches a query word with its thread, time and text', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking before the wind picks up',
    spans: [{ start: 0, end: 51, source: 'typed' }],
  });

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result).toStrictEqual({
    messages: [
      {
        sequence,
        thread: 'garden',
        recordedAt: expect.toBeNumber(),
        text: 'The tomatoes need staking before the wind picks up',
        isCut: false,
      },
    ],
    searchMode: 'keyword',
  });
});

test('it places past messages that share no word with the query by meaning, up to the limit', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['boiler', 'heating', 'radiator', 'furnace'], ['hazelnuts']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  await memory.store.waitForSemanticIndex();

  const clanks = await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'The boiler clanks at night',
    spans: [{ start: 0, end: 26, source: 'typed' }],
  });

  const cold = await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'The radiator in the hall stays cold',
    spans: [{ start: 0, end: 35, source: 'typed' }],
  });

  const booked = await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'Booked the furnace check for Friday',
    spans: [{ start: 0, end: 35, source: 'typed' }],
  });

  const old = await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'Our boiler is fifteen years old',
    spans: [{ start: 0, end: 31, source: 'typed' }],
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'Allergic to hazelnuts',
    spans: [{ start: 0, end: 21, source: 'typed' }],
  });

  const result = await memory.store.recallMessages({
    query: 'When is the heating engineer coming?',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual(
    Array.from({ length: 3 }, () => expect.toBeOneOf([clanks, cold, booked, old])),
  );

  expect(result.searchMode).toBe('hybrid');
});

test('it places by keyword alone while the vector index rebuilds', async () => {
  const first = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(first.log, {
    thread: 'garden',
    text: 'The tomatoes need staking',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const gated = makeGatedCall(buildStubEncoder([['tomatoes']]).encode);

  const memory = await startNextTestMemory(first, {
    semanticSearch: { encoder: { encode: gated.call }, onError: mock<(error: unknown) => void>() },
  });

  await gated.started;

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  gated.release();

  expect(result.searchMode).toBe('keyword-fallback');
  expect(result.messages.map((message) => message.sequence)).toStrictEqual([sequence]);
});

test('it leaves out the excluded messages before the limit applies', async () => {
  const memory = await startTestMemory();

  const held = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'The tomatoes need staking',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const other = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'Picked the first tomatoes today',
    spans: [{ start: 0, end: 31, source: 'typed' }],
  });

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 1,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [held],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual([other]);
});

test('it never returns a message you forgot, even while its entry is still in the index', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const query = {
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  };

  const before = await memory.store.recallMessages(query);

  await removeMessageKey(memory.log, sequence);

  const after = await memory.store.recallMessages(query);

  expect(before.messages.map((message) => message.sequence)).toStrictEqual([sequence]);
  expect(after.messages).toStrictEqual([]);
});

test('it never returns a message you forgot once its entry leaves the index', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  await removeMessageKey(memory.log, sequence);

  await memory.store.removeMessages([sequence]);

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it never returns a message you forgot after a restart rebuilds the index', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  await removeMessageKey(memory.log, sequence);

  const restarted = await startNextTestMemory(memory);

  const result = await restarted.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it never returns a message that backed an item you forgot', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'My locker code is the year the tomatoes failed',
    spans: [{ start: 0, end: 46, source: 'typed' }],
  });

  const item = await memory.store.writes.remember({
    text: 'Locker code is the year the tomatoes failed',
    quote: 'My locker code is the year the tomatoes failed',
    caller: buildMockWriteCaller(),
  });

  invariant(item.status === 'applied');

  const query = {
    query: 'locker code',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  };

  const before = await memory.store.recallMessages(query);

  await memory.store.forget({
    target: { itemID: item.itemID, version: item.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const after = await memory.store.recallMessages(query);

  expect(before.messages).toHaveLength(1);
  expect(after.messages).toStrictEqual([]);
});

test('it never returns a message that backed an item you forgot after a restart', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'My locker code is the year the tomatoes failed',
    spans: [{ start: 0, end: 46, source: 'typed' }],
  });

  const item = await memory.store.writes.remember({
    text: 'Locker code is the year the tomatoes failed',
    quote: 'My locker code is the year the tomatoes failed',
    caller: buildMockWriteCaller(),
  });

  invariant(item.status === 'applied');

  await memory.store.forget({
    target: { itemID: item.itemID, version: item.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restarted = await startNextTestMemory(memory);

  const result = await restarted.store.recallMessages({
    query: 'locker code',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it cuts a long message before it renders, so a paste it cuts still closes', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: `Tomatoes, from the seed packet: ${'water daily '.repeat(100)}`,
    spans: [
      { start: 0, end: 32, source: 'typed' },
      { start: 32, end: 1232, source: 'pasted' },
    ],
  });

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.isCut)).toStrictEqual([true]);

  expect(result.messages[0]?.text).toMatch(
    /^Tomatoes, from the seed packet: <pasted id="(?<id>[\da-f]{12})">(?:water daily ){80}water da<\/pasted id="\k<id>">$/u,
  );
});

test('it never returns a message that is all paste', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking before the wind picks up',
    spans: [{ start: 0, end: 50, source: 'pasted' }],
  });

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it never returns a message that is all paste after a restart rebuilds the index', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking before the wind picks up',
    spans: [{ start: 0, end: 50, source: 'pasted' }],
  });

  const restarted = await startNextTestMemory(memory);

  const result = await restarted.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it returns a message that matches on its typed words with its paste in a block', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'Check the beds tonight: The tomatoes need staking',
    spans: [
      { start: 0, end: 24, source: 'typed' },
      { start: 24, end: 49, source: 'pasted' },
    ],
  });

  const result = await memory.store.recallMessages({
    query: 'beds',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual([sequence]);

  expect(result.messages[0]?.text).toMatch(
    /^Check the beds tonight: <pasted id="(?<id>[\da-f]{12})">The tomatoes need staking<\/pasted id="\k<id>">$/u,
  );
});

test('it never returns a message for a query that matches only its pasted words', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'Check the beds tonight: The tomatoes need staking',
    spans: [
      { start: 0, end: 24, source: 'typed' },
      { start: 24, end: 49, source: 'pasted' },
    ],
  });

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it returns a message that matches on words typed after its paste', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'Check the greenhttps://example.test/seedshouse tonight',
    spans: [
      { start: 0, end: 15, source: 'typed' },
      { start: 15, end: 41, source: 'pasted' },
      { start: 41, end: 54, source: 'typed' },
    ],
  });

  const result = await memory.store.recallMessages({
    query: 'tonight',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual([sequence]);
});

test('it never joins the typed words on either side of a paste into one word', async () => {
  const memory = await startTestMemory();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'Check the greenhttps://example.test/seedshouse tonight',
    spans: [
      { start: 0, end: 15, source: 'typed' },
      { start: 15, end: 41, source: 'pasted' },
      { start: 41, end: 54, source: 'typed' },
    ],
  });

  const result = await memory.store.recallMessages({
    query: 'greenhouse',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages).toStrictEqual([]);
});

test('it never places a message by the meaning of its pasted words', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['invoice', 'billing'], ['beds']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  await memory.store.waitForSemanticIndex();

  await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'Check the beds tonight: Your invoice is overdue',
    spans: [
      { start: 0, end: 24, source: 'typed' },
      { start: 24, end: 47, source: 'pasted' },
    ],
  });

  const typed = await writeOwnerMessageRecord(memory.log, {
    thread: 'home',
    text: 'The invoice came today',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const result = await memory.store.recallMessages({
    query: 'billing',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual([typed]);
  expect(result.searchMode).toBe('hybrid');
});

test('it matches the whole text of a message recorded without spans', async () => {
  const memory = await startTestMemory();

  const [record] = await writeRecords(memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'garden',
      contentSource: 'owner',
      payload: {},
      erasable: { text: 'The tomatoes need staking' },
    },
  ]);

  invariant(record);

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual([record.sequence]);
});

test('it matches the whole text of a message whose client labelled no span', async () => {
  const memory = await startTestMemory();

  const sequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'garden',
    text: 'The tomatoes need staking',
    spans: [{ start: 0, end: 25, source: 'unknown' }],
  });

  const result = await memory.store.recallMessages({
    query: 'tomatoes',
    limit: 3,
    minScore: 0,
    minSimilarity: 0.38,
    excludedSequences: [],
    excludedWords: [],
  });

  expect(result.messages.map((message) => message.sequence)).toStrictEqual([sequence]);
});
