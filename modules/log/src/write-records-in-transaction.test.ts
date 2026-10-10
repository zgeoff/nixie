import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { startTestLog } from './test-utils/start-test-log';
import { withWriteTransaction } from './with-write-transaction';
import { writeRecordsInTransaction } from './write-records-in-transaction';

test('it commits the records with the rows the caller writes in the same transaction', async () => {
  const ctx = await startTestLog();

  await sql`create table notes (title text not null) strict`.execute(ctx.writer.db);

  const records = await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into notes (title) values ('seeded')`.execute(tx);
    return writeRecordsInTransaction(tx, ctx.log, [
      { kind: 'note_written', definitions: { snapshotHash: 'sha256:aa11' } },
    ]);
  });

  const notes = await sql`select title from notes`.execute(ctx.writer.db);
  const stored = await sql`select sequence, kind from records`.execute(ctx.writer.db);

  expect(records.map((record) => record.sequence)).toStrictEqual([1]);
  expect(notes.rows).toStrictEqual([{ title: 'seeded' }]);
  expect(stored.rows).toStrictEqual([{ sequence: 1, kind: 'note_written' }]);
});

test('it rolls the records back when the caller fails after writing them', async () => {
  const ctx = await startTestLog();

  await sql`create table notes (title text not null) strict`.execute(ctx.writer.db);

  const write = withWriteTransaction(ctx.writer, async (tx) => {
    await writeRecordsInTransaction(tx, ctx.log, [
      { kind: 'note_written', definitions: { snapshotHash: 'sha256:aa11' } },
    ]);
    await sql`insert into notes (title) values (null)`.execute(tx);
  });

  await write.catch(() => {});

  const notes = await sql`select title from notes`.execute(ctx.writer.db);
  const stored = await sql`select sequence from records`.execute(ctx.writer.db);

  expect(write).rejects.toThrow('NOT NULL constraint failed');
  expect(notes.rows).toStrictEqual([]);
  expect(stored.rows).toStrictEqual([]);
});
