import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { startTestLog } from '../test-utils/start-test-log';
import { makeReadLastMessageAt } from './make-read-last-message-at';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-read-last-message-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(Date.parse('2027-03-09T00:00:00Z'));

  const log = await startTestLog(dataDir, clock);

  onTestFinished(() => log.writer.stop());

  return {
    clock,
    log,
    readLastMessageAt: makeReadLastMessageAt(log.writer),
    writeOwnerMessage: () =>
      writeRecords(log, [
        {
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          payload: { timeZone: 'Asia/Tokyo' },
        },
      ]),
  };
}

test('it returns null when the owner has sent no message', async () => {
  const ctx = await setupTest();
  const lastMessageAt = await ctx.readLastMessageAt();

  expect(lastMessageAt).toBeNull();
});

test('it returns the time of the newest owner message', async () => {
  const ctx = await setupTest();

  await ctx.writeOwnerMessage();

  ctx.clock.advance(90_000);

  await ctx.writeOwnerMessage();

  const lastMessageAt = await ctx.readLastMessageAt();

  expect(lastMessageAt).toBe(Date.parse('2027-03-09T00:01:30Z'));
});
