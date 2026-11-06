import { expect, test } from 'bun:test';
import { writeRecords } from '../write-records';
import { readTestRecordAttachmentRows } from './read-test-record-attachment-rows';
import { startTestLog } from './start-test-log';

function setupTest() {
  return startTestLog();
}

test('it reads each attachment as stored, sealed, in record and position order', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'two plans' },
      attachments: [new TextEncoder().encode('plan-of-the-shed'), new Uint8Array([4, 5])],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'one more' },
      attachments: [new TextEncoder().encode('plan-of-the-pond')],
    },
  ]);

  const rows = await readTestRecordAttachmentRows(ctx.writer);

  expect(rows).toStrictEqual([
    { sequence: 1, position: 0, sealed: expect.any(Uint8Array) },
    { sequence: 1, position: 1, sealed: expect.any(Uint8Array) },
    { sequence: 2, position: 0, sealed: expect.any(Uint8Array) },
  ]);

  expect(rows.map((row) => new TextDecoder().decode(row.sealed))).toSatisfyAll(
    (text: string) => !text.includes('plan-of-the-'),
  );
});
