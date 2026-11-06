import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { writeRecords } from '../write-records';
import { readTestRecordKeyRows } from './read-test-record-key-rows';
import { startTestLog } from './start-test-log';

function setupTest() {
  return startTestLog();
}

test('it reads the wrapped key of each record with erasable fields, in key order', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'the boiler code is 0911' },
    },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'the wifi name is Lantern' },
    },
  ]);

  const stored = await readQueryRows(
    sql`select key_id from records where key_id is not null`,
    ctx.writer.db,
    z.object({ key_id: z.string() }),
  );

  const [first, second] = stored.map((row) => row.key_id).toSorted();

  invariant(first !== undefined && second !== undefined);

  const rows = await readTestRecordKeyRows(ctx.writer);

  expect(rows).toStrictEqual([
    { key_id: first, wrapped: expect.any(Uint8Array) },
    { key_id: second, wrapped: expect.any(Uint8Array) },
  ]);
});
