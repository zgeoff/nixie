import { expect, test } from 'bun:test';
import { claimWriterEpoch } from '../claim-writer-epoch';
import { readTestWriterEpoch } from './read-test-writer-epoch';
import { startTestLog } from './start-test-log';

function setupTest() {
  return startTestLog();
}

test('it reads the epoch of the latest writer claim', async () => {
  const ctx = await setupTest();

  await claimWriterEpoch(ctx.writer.db);

  const epoch = await readTestWriterEpoch(ctx.writer);

  expect(epoch).toBe(2);
});
