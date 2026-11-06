import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readRecords } from '../read-records';
import { writeRecords } from '../write-records';
import { removeTestRecordKey } from './remove-test-record-key';
import { startTestLog } from './start-test-log';

function setupTest() {
  return startTestLog();
}

test('it shreds the erasable fields of the record at a sequence and leaves the others readable', async () => {
  const ctx = await setupTest();

  const [shredded, kept] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'the gate code is 4417' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'the bins go out on Tuesday' },
    },
  ]);

  invariant(shredded && kept);

  await removeTestRecordKey(ctx.log, shredded.sequence);

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((read) => [read.record.sequence, read.record.erasable])).toStrictEqual([
    [shredded.sequence, { status: 'shredded' }],
    [kept.sequence, { status: 'readable', fields: { text: 'the bins go out on Tuesday' } }],
  ]);
});

test('it rejects a record with no key', async () => {
  const ctx = await setupTest();

  const [plain] = await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  invariant(plain);

  const removal = removeTestRecordKey(ctx.log, plain.sequence);

  await removal.catch(() => {});

  expect(removal).rejects.toThrow('has no key');
});
