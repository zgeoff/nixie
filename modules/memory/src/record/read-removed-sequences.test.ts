import { expect, test } from 'bun:test';
import { erasureStartedCodec, writeRecords } from '@heynixie/log';
import { startTestMemory } from '../test-utils/start-test-memory';
import { readRemovedSequences } from './read-removed-sequences';
import { recordForgetStartedCodec } from './record-forget-started-codec';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads only the sequences that a forget start names', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: recordForgetStartedCodec.encode({ recordSequence: 7 }),
    },
  ]);

  const removed = await readRemovedSequences(ctx.memory.writer.db, [6, 7, 8]);

  expect([...removed]).toStrictEqual([7]);
});

test('it reads no sequence from an empty list', async () => {
  const ctx = await setupTest();
  const removed = await readRemovedSequences(ctx.memory.writer.db, []);

  expect([...removed]).toStrictEqual([]);
});

test('it reads the record that an erasure of the record kind names', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: recordForgetStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: recordForgetStartedCodec.encode({ recordSequence: 7 }),
    },
    {
      kind: erasureStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      payload: erasureStartedCodec.encode({
        erasureID: 'e1',
        kind: 'record',
        targetID: '11',
        shortID: null,
        version: null,
        parentID: null,
        by: 'user',
        capture: {
          keys: { ids: [] },
          cleanupKeys: [],
          sandboxCallIDs: [],
          purges: [],
          sessionCause: { recordSequence: 11 },
          turnInputs: { threads: [], cleaned: true, floor: 11 },
        },
        keyCount: 0,
      }),
    },
    {
      kind: erasureStartedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      payload: erasureStartedCodec.encode({
        erasureID: 'e2',
        kind: 'image',
        targetID: '8',
        shortID: null,
        version: null,
        parentID: null,
        by: 'user',
        capture: {
          keys: { ids: [] },
          cleanupKeys: [],
          sandboxCallIDs: [],
          purges: [],
          sessionCause: { sessions: 'none' },
          turnInputs: { threads: 'none', cleaned: false, floor: null },
        },
        keyCount: 0,
      }),
    },
  ]);

  const removed = await readRemovedSequences(ctx.memory.writer.db, [6, 7, 8, 11]);

  expect([...removed].toSorted((left, right) => left - right)).toStrictEqual([7, 11]);
});
