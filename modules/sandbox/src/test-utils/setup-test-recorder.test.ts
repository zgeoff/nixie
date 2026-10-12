import { expect, onTestFinished, test } from 'bun:test';
import { exists } from 'node:fs/promises';
import { writeRecords } from '@heynixie/log';
import { sandboxesProjection } from '../sandboxes-projection';
import { setupTestRecorder } from './setup-test-recorder';

test('it gives the log the sandboxes projection', async () => {
  const ctx = await setupTestRecorder();

  expect(ctx.log.projections).toContain(sandboxesProjection);
});

test('it writes each event as the next record, in order', async () => {
  const ctx = await setupTestRecorder();

  await ctx.writeEvents([
    { event: 'slept', sandboxID: 'nixie-a' },
    { event: 'woken', sandboxID: 'nixie-a' },
  ]);

  const records = await ctx.readSandboxRecords();

  expect(records.map((record) => record.kind)).toStrictEqual(['sandbox.slept', 'sandbox.woken']);
});

test('it reads back sandbox records alone', async () => {
  const ctx = await setupTestRecorder();

  await writeRecords(ctx.log, [
    { kind: 'task.created', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
  ]);
  await ctx.writeEvents([{ event: 'slept', sandboxID: 'nixie-a' }]);

  const records = await ctx.readSandboxRecords();

  expect(records.map((record) => record.kind)).toStrictEqual(['sandbox.slept']);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await setupTestRecorder();

  onTestFinished(async () => {
    const isLeft = await exists(ctx.log.writer.dataDir);

    expect(isLeft).toBeFalse();
  });

  const isMade = await exists(ctx.log.writer.dataDir);

  expect(isMade).toBeTrue();
});
