import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestAPI } from '../test-utils/start-test-api';
import { readRecordForget } from './read-record-forget';

function setupTest() {
  return startTestAPI();
}

test('it finds the first record of the kind that names the sequence', async () => {
  const ctx = await setupTest();

  const [first] = await writeRecords(ctx.context.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: 4 },
    },
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: 4 },
    },
  ]);

  invariant(first);

  const found = await readRecordForget(ctx.writer.db, {
    kind: 'record.forget_started',
    sequence: 4,
  });

  expect(found).toStrictEqual({ sequence: first.sequence, recordedAt: expect.toBeNumber() });
});

test('it finds none for a sequence that no record of the kind names', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: 4 },
    },
  ]);

  const found = await readRecordForget(ctx.writer.db, { kind: 'record.forgotten', sequence: 4 });

  expect(found).toBeNull();
});

test('it finds the erasure that began the forget of the record kind', async () => {
  const ctx = await setupTest();

  const [started] = await writeRecords(ctx.context.log, [
    {
      kind: 'erasure.started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        erasureID: 'e1',
        kind: 'record',
        targetID: '4',
        shortID: null,
        version: null,
        parentID: null,
        by: 'user',
        capture: {
          keys: { ids: [] },
          cleanupKeys: [],
          sandboxCallIDs: [],
          purges: [],
          sessionCause: { recordSequence: 4 },
          turnInputs: { threads: [], cleaned: true, floor: 4 },
        },
        keyCount: 0,
      },
    },
  ]);

  invariant(started);

  const found = await readRecordForget(ctx.writer.db, {
    kind: 'record.forget_started',
    sequence: 4,
  });

  const ended = await readRecordForget(ctx.writer.db, { kind: 'record.forgotten', sequence: 4 });

  expect({ found, ended }).toStrictEqual({
    found: { sequence: started.sequence, recordedAt: expect.toBeNumber() },
    ended: null,
  });
});

test('it finds the erasure that ended the forget of the record kind', async () => {
  const ctx = await setupTest();

  const [finished] = await writeRecords(ctx.context.log, [
    {
      kind: 'erasure.finished',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        erasureID: 'e1',
        kind: 'record',
        targetID: '4',
        shortID: null,
        by: 'user',
        removedKeys: 2,
      },
    },
  ]);

  invariant(finished);

  const ended = await readRecordForget(ctx.writer.db, { kind: 'record.forgotten', sequence: 4 });

  expect(ended).toStrictEqual({ sequence: finished.sequence, recordedAt: expect.toBeNumber() });
});
