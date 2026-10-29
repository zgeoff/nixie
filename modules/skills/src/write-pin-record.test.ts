import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, startWriter } from '@heynixie/log';
import { writePinRecord } from './write-pin-record';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-pin-record-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it writes the first pin of a thread', async () => {
  const ctx = await setupTest();

  const isWritten = await writePinRecord(ctx.log, {
    kind: 'skills.pinned',
    thread: 'task-a',
    definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
    payload: { skills: [] },
  });

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(isWritten).toBeTrue();
  expect(pins.map((entry) => entry.record.thread)).toStrictEqual(['task-a']);
});

test('it refuses a second first pin of a pinned thread, and writes nothing', async () => {
  const ctx = await setupTest();

  await writePinRecord(ctx.log, {
    kind: 'skills.pinned',
    thread: 'task-a',
    definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
    payload: { skills: [] },
  });

  const isWritten = await writePinRecord(ctx.log, {
    kind: 'skills.pinned',
    thread: 'task-a',
    definitions: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
    payload: { skills: [{ name: 'tide-tables', skillHash: 'hash-a', origin: 'definitions' }] },
  });

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(isWritten).toBeFalse();
  expect(pins.map((entry) => entry.record.definitions.snapshotHash)).toStrictEqual(['snapshot-a']);
});

test('it writes one pin when 2 first pins of a thread race', async () => {
  const ctx = await setupTest();

  const results = await Promise.all([
    writePinRecord(ctx.log, {
      kind: 'skills.pinned',
      thread: 'task-a',
      definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
      payload: { skills: [] },
    }),
    writePinRecord(ctx.log, {
      kind: 'skills.pinned',
      thread: 'task-a',
      definitions: { snapshotHash: 'snapshot-b', personaVersion: 'persona-a' },
      payload: { skills: [] },
    }),
  ]);

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(results.toSorted((left, right) => Number(left) - Number(right))).toStrictEqual([
    false,
    true,
  ]);

  expect(pins).toHaveLength(1);
});

test('it pins a thread whose only pin is on another thread', async () => {
  const ctx = await setupTest();

  await writePinRecord(ctx.log, {
    kind: 'skills.pinned',
    thread: 'task-b',
    definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
    payload: { skills: [] },
  });

  const isWritten = await writePinRecord(ctx.log, {
    kind: 'skills.pinned',
    thread: 'task-a',
    definitions: { snapshotHash: 'snapshot-a', personaVersion: 'persona-a' },
    payload: { skills: [] },
  });

  expect(isWritten).toBeTrue();
});
