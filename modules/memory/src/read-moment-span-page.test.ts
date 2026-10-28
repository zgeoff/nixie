import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMomentSpanPage } from './read-moment-span-page';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
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
      isCut: false,
    },
  ]);
});
