import { expect, test } from 'bun:test';
import { writeRecords } from '../write-records';
import { readTestRecordRows } from './read-test-record-rows';
import { startTestLog } from './start-test-log';

function setupTest() {
  return startTestLog();
}

test('it reads each record as stored, with its erasable fields sealed under a key, oldest first', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      payload: { spans: 1 },
      erasable: { text: 'the spare key is under the mat' },
    },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const rows = await readTestRecordRows(ctx.writer);

  expect(rows).toMatchObject([
    {
      sequence: 1,
      kind: 'owner_message',
      thread: 'conversation',
      payload: '{"spans":1}',
      key_id: expect.toBeString(),
      sealed: expect.anything(),
    },
    { sequence: 2, kind: 'owner_message', thread: null, payload: '{}', key_id: null, sealed: null },
  ]);

  expect(JSON.stringify(rows)).not.toInclude('the spare key is under the mat');
});
