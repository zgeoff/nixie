import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readRecordsByKind } from './read-records-by-kind';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it reads the records of one kind and none of another', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    { kind: 'model.reply', definitions: { snapshotHash: 'sha256:test' }, payload: { n: 1 } },
    { kind: 'model.turn_ended', definitions: { snapshotHash: 'sha256:test' }, payload: { n: 2 } },
    { kind: 'model.reply', definitions: { snapshotHash: 'sha256:test' }, payload: { n: 3 } },
  ]);

  const records = await readRecordsByKind(ctx.context.log, 'model.reply');

  expect(records.map((record) => record.payload)).toStrictEqual([{ n: 1 }, { n: 3 }]);
});
