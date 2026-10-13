import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import { nixieVersion } from './nixie-version';
import { startTestLog } from './test-utils/start-test-log';
import { writeStartRecord } from './write-start-record';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-start-record-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());
  return { log, context: { log, definitions: () => ({ snapshotHash: 'sha256:test' }) } };
}

test('it records the first start with no previous version', async () => {
  const ctx = await setupTest();

  await writeStartRecord(ctx.context, '0.12.0');

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { version: '0.12.0', previousVersion: null },
  ]);
});

test('it records the version of the start before', async () => {
  const ctx = await setupTest();

  await writeStartRecord(ctx.context, '0.11.0');
  await writeStartRecord(ctx.context, '0.12.0');

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { version: '0.11.0', previousVersion: null },
    { version: '0.12.0', previousVersion: '0.11.0' },
  ]);
});

test("it records this build's version when the caller names none", async () => {
  const ctx = await setupTest();

  await writeStartRecord(ctx.context);

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { version: nixieVersion, previousVersion: null },
  ]);
});
