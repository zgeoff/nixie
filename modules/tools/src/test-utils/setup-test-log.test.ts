import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readRecords, writeRecords } from '@heynixie/log';
import { setupTestLog } from './setup-test-log';

test('it starts a log that appends and reads back an encrypted record', async () => {
  const ctx = await setupTestLog();

  await writeRecords(ctx.log, [
    { kind: 'tool_called', definitions: { snapshotHash: 'sha256:test' }, erasable: { input: 'x' } },
  ]);

  const entries = await readRecords(ctx.log, { afterSequence: 0 });

  expect(entries.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { input: 'x' } },
  ]);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await setupTestLog();

  onTestFinished(() => {
    expect(existsSync(ctx.dataDir)).toBeFalse();
  });

  expect(existsSync(ctx.dataDir)).toBeTrue();
});
