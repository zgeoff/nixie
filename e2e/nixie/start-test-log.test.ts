import { expect, onTestFinished, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { startTestLog } from './start-test-log';

// a fresh data directory, which no nixie holds
async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-test-log-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it records each record at the time on the clock it takes', async () => {
  const ctx = await setupTest();

  const clock = buildTestClock(1_000_000);

  const testLog = await startTestLog({
    dataDir: ctx.dataDir,
    deploymentKey: randomBytes(32).toString('base64'),
    clock,
  });

  onTestFinished(() => testLog.writer.stop());

  clock.advance(10_000);

  await writeRecords(testLog.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I live at 4 Elm Row.' },
    },
  ]);

  const records = await readRecords(testLog.context.log, { afterSequence: 0 });

  expect(records.map((read) => read.record.recordedAt)).toStrictEqual([new Date(1_010_000)]);
});
