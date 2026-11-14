/* oxlint-disable id-length -- the image pointer's field is n, as the number input of log.read_image names it */
import { expect, test } from 'bun:test';
import { removeSummaryKeys } from '@heynixie/compaction';
import { writeRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { readMomentSpanPage } from './read-moment-span-page';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  const readOnlyEntry = async (sequence: number, deploymentKey: CryptoKey) => {
    const page = await readMomentSpanPage(
      { deploymentKey, writer: memory.writer },
      {
        thread: 'conversation',
        firstSequence: sequence,
        lastSequence: sequence,
        after: null,
        tokenCap: 6000,
        records: 'all',
        reader: 'model',
      },
    );

    const [entry] = page.entries;

    invariant(entry);

    return entry;
  };

  return { memory, readOnlyEntry };
}

test('it cuts a record larger than the page until the entry, escaped as the reader gets it, fits the cap', async () => {
  const ctx = await setupTest();

  const [reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: '"'.repeat(24_000) },
    },
  ]);

  invariant(reply);

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: reply.sequence,
    lastSequence: reply.sequence,
    after: null,
    tokenCap: 6000,
    records: 'all',
    reader: 'model',
  });

  const [entry] = page.entries;

  invariant(entry);

  expect(Math.ceil(JSON.stringify(entry).length / 4)).toBeLessThanOrEqual(6000);
  expect(entry.isCut).toBeTrue();
  expect(entry.text).toStartWith('"'.repeat(100));
});

test('it leaves out a payload that alone outgrows the page, so the entry still fits the cap', async () => {
  const ctx = await setupTest();

  const [wake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { reasons: Array.from({ length: 4000 }, (_, index) => `reason-${String(index)}`) },
    },
  ]);

  invariant(wake);

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: wake.sequence,
    lastSequence: wake.sequence,
    after: null,
    tokenCap: 6000,
    records: 'all',
    reader: 'model',
  });

  const [entry] = page.entries;

  invariant(entry);

  expect(entry.payload).toBeNull();
  expect(entry.isCut).toBeTrue();
  expect(Math.ceil(JSON.stringify(entry).length / 4)).toBeLessThanOrEqual(6000);
});

test('it gives each record its payload and its policy decision beside its text', async () => {
  const ctx = await setupTest();

  const [called] = await writeRecords(ctx.memory.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      decision: { outcome: 'deny', stage: 2, rule: null },
      payload: { callID: 'call-1', runID: 'run-1', toolUseID: null, tool: 'web.fetch' },
      erasable: { input: { url: 'https://example.test/kettles' } },
    },
  ]);

  invariant(called);

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: called.sequence,
    lastSequence: called.sequence,
    after: null,
    tokenCap: 6000,
    records: 'all',
    reader: 'model',
  });

  expect(page.entries).toStrictEqual([
    {
      sequence: called.sequence,
      kind: 'tool_called',
      recordedAt: expect.any(Number),
      source: 'nixie',
      payload: { callID: 'call-1', runID: 'run-1', toolUseID: null, tool: 'web.fetch' },
      decision: 'deny',
      text: JSON.stringify({ input: { url: 'https://example.test/kettles' } }),
      images: [],
      isGap: false,
      isRemoved: false,
      isCut: false,
    },
  ]);
});

test('it reads a record whose key fails to decrypt as a gap that is not removed', async () => {
  const ctx = await setupTest();

  const [reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The blue flowerpot holds the spare key' },
    },
  ]);

  invariant(reply);

  const otherKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const entry = await ctx.readOnlyEntry(reply.sequence, otherKey);

  expect([entry.text, entry.isGap, entry.isRemoved]).toStrictEqual([null, true, false]);
});

test('it reads a session summary whose key a cleanup deleted as a gap that is not removed', async () => {
  const ctx = await setupTest();

  const [summary] = await writeRecords(ctx.memory.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0, trigger: 'threshold', summaryTokens: 9 },
      erasable: { text: 'Open threads: the red bike has a flat tyre.' },
    },
  ]);

  invariant(summary);

  await removeSummaryKeys(ctx.memory.log, 'conversation');

  const entry = await ctx.readOnlyEntry(summary.sequence, ctx.memory.deploymentKey);

  expect([entry.text, entry.isGap, entry.isRemoved]).toStrictEqual([null, true, false]);
});

test.each([
  {
    reader: 'model' as const,
    texts: [
      '{"result":{"hits":[]}}',
      '{"result":{"hits":[]}}',
      '{"message":"the session ended while the search ran, so it returns no hits"}',
    ],
  },
  {
    reader: 'owner' as const,
    texts: [
      '{"result":{"hits":[]},"hidden":{"costUSD":0.012}}',
      '{"result":{"hits":[],"costUSD":0.012}}',
      '{"message":"the session ended while the search ran, so it returns no hits","hidden":{"costUSD":0.012}}',
    ],
  },
])('it prints a search result and a refused search for the $reader as $texts', async (row) => {
  const ctx = await setupTest();

  const written = await writeRecords(ctx.memory.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: { hits: 'untrusted' } },
      erasable: { result: { hits: [] }, hidden: { costUSD: 0.012 } },
    },
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: { hits: 'untrusted' } },
      erasable: { result: { hits: [], costUSD: 0.012 } },
    },
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'error', sources: { message: 'untrusted' } },
      erasable: {
        message: 'the session ended while the search ran, so it returns no hits',
        hidden: { costUSD: 0.012 },
      },
    },
  ]);

  invariant(written[0] && written[2]);

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: written[0].sequence,
    lastSequence: written[2].sequence,
    after: null,
    tokenCap: 6000,
    records: 'all',
    reader: row.reader,
  });

  expect(page.entries.map((entry) => entry.text)).toStrictEqual([...row.texts]);
});

test.each([
  { reader: 'model' as const, field: 'short' },
  { reader: 'owner' as const, field: 'uuid' },
])('it prints a moment tool record of the span with the $field ID for the $reader', async (row) => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const [written] = await writeRecords(ctx.memory.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: {} },
      erasable: { result: { momentID: kept.momentID, version: 1 } },
    },
  ]);

  invariant(written);

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: written.sequence,
    lastSequence: written.sequence,
    after: null,
    tokenCap: 6000,
    records: 'all',
    reader: row.reader,
  });

  const shown = row.field === 'short' ? kept.shortID : kept.momentID;

  expect(page.entries.map((entry) => entry.text)).toStrictEqual([
    JSON.stringify({ result: { momentID: shown, version: 1 } }),
  ]);
});

test('it lists a pointer to each image of an owner message, numbered from 1', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'two shelf photos',
    spans: [],
    images: ['image/png', 'image/webp'],
  });

  const entry = await ctx.readOnlyEntry(sequence, ctx.memory.deploymentKey);

  expect(entry.images).toStrictEqual([
    { n: 1, mediaType: 'image/png' },
    { n: 2, mediaType: 'image/webp' },
  ]);
});

test('it lists no image of an owner message that was forgotten', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'two shelf photos',
    spans: [],
    images: ['image/png', 'image/webp'],
  });

  await removeTestRecordKey(ctx.memory.log, sequence);

  const entry = await ctx.readOnlyEntry(sequence, ctx.memory.deploymentKey);

  expect([entry.isGap, entry.images]).toStrictEqual([true, []]);
});

test('it lists the images of a readable owner message whose attachments are unreadable', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'one shelf photo',
    spans: [],
    images: ['image/png'],
  });

  const entry = await ctx.readOnlyEntry(sequence, ctx.memory.deploymentKey);

  expect(entry.images).toStrictEqual([{ n: 1, mediaType: 'image/png' }]);
});

test('it lists no image of a record that is not an owner message', async () => {
  const ctx = await setupTest();

  const [reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'a drawing of the gate' },
    },
  ]);

  invariant(reply);

  const entry = await ctx.readOnlyEntry(reply.sequence, ctx.memory.deploymentKey);

  expect(entry.images).toStrictEqual([]);
});

test('it lists no image of an owner message whose payload fails the codec', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/bmp' }] },
      erasable: { text: 'a shelf photo', spans: [] },
    },
  ]);

  invariant(message);

  const entry = await ctx.readOnlyEntry(message.sequence, ctx.memory.deploymentKey);

  expect(entry.images).toStrictEqual([]);
});

test('it keeps the whole image list of a record cut by a small cap and drops its payload', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'a long run of shelf photos '.repeat(200),
    spans: [],
    images: Array.from({ length: 80 }, () => 'image/png'),
  });

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: sequence,
    lastSequence: sequence,
    after: null,
    tokenCap: 1100,
    records: 'all',
    reader: 'model',
  });

  const [entry] = page.entries;

  invariant(entry);

  expect([entry.isCut, entry.payload, entry.images.length]).toStrictEqual([true, null, 80]);
  expect(Math.ceil(JSON.stringify(entry).length / 4)).toBeLessThanOrEqual(1100);
});
