import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '../test-utils/start-test-log';
import { makeReadZone } from './make-read-zone';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-read-zone-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  onTestFinished(() => log.writer.stop());

  return {
    log,
    readZone: makeReadZone(log.writer, log.writer.db, 'Europe/Lisbon'),
  };
}

test('it resolves owner to the zone of the newest owner message', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { timeZone: 'Asia/Tokyo' },
    },
  ]);

  const zone = await ctx.readZone('owner');

  expect(zone).toBe('Asia/Tokyo');
});

test('it resolves owner to the default zone when no owner message carries a zone', async () => {
  const ctx = await setupTest();
  const zone = await ctx.readZone('owner');

  expect(zone).toBe('Europe/Lisbon');
});

test('it returns any other zone as it is', async () => {
  const ctx = await setupTest();
  const zone = await ctx.readZone('Australia/Sydney');

  expect(zone).toBe('Australia/Sydney');
});
