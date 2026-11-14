import { expect, test } from 'bun:test';
import { removeSummaryKeys } from '@heynixie/compaction';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMomentSpanPage } from './read-moment-span-page';
import { startTestMemory } from './test-utils/start-test-memory';

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
    texts: ['{"result":{"hits":[]}}', '{"result":{"hits":[]}}'],
  },
  {
    reader: 'owner' as const,
    texts: [
      '{"result":{"hits":[]},"hidden":{"costUSD":0.012}}',
      '{"result":{"hits":[],"costUSD":0.012}}',
    ],
  },
])('it prints a search result for the $reader as $texts', async (row) => {
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
  ]);

  invariant(written[0] && written[1]);

  const page = await readMomentSpanPage(ctx.memory.log, {
    thread: 'conversation',
    firstSequence: written[0].sequence,
    lastSequence: written[1].sequence,
    after: null,
    tokenCap: 6000,
    records: 'all',
    reader: row.reader,
  });

  expect(page.entries.map((entry) => entry.text)).toStrictEqual([...row.texts]);
});

test('it prints a refused search for the owner and the model as its message alone', async () => {
  const ctx = await setupTest();

  const written = await writeRecords(ctx.memory.log, [
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

  invariant(written[0]);

  const readers = ['model', 'owner'] as const;

  const pages = await Promise.all(
    readers.map((reader) =>
      readMomentSpanPage(ctx.memory.log, {
        thread: 'conversation',
        firstSequence: written[0]?.sequence ?? 0,
        lastSequence: written[0]?.sequence ?? 0,
        after: null,
        tokenCap: 6000,
        records: 'all',
        reader,
      }),
    ),
  );

  expect(pages.map((page) => page.entries.map((entry) => entry.text))).toStrictEqual([
    ['{"message":"the session ended while the search ran, so it returns no hits"}'],
    [
      '{"message":"the session ended while the search ran, so it returns no hits","hidden":{"costUSD":0.012}}',
    ],
  ]);
});
