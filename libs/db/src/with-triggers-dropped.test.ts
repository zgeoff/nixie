import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { startDatabase } from './start-database';
import { withTriggersDropped } from './with-triggers-dropped';

// a parent table whose rows a trigger refuses to delete, and a child that points at a parent
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-triggers-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = startDatabase(join(dir, 'nixie.db'));

  stack.defer(() => db.destroy());
  await sql`create table entries (id integer primary key) strict`.execute(db);
  await sql`create table pins (
    pin text primary key,
    entry integer not null references entries (id)
  ) strict`.execute(db);
  await sql`create trigger entries_refuse_delete before delete on entries
    begin select raise(abort, 'entries are append-only'); end`.execute(db);

  return { db };
}

test('it lets the callback delete rows that a trigger refuses to delete', async () => {
  const ctx = await setupTest();

  await sql`insert into entries (id) values (1), (2)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) =>
    withTriggersDropped(tx, async () => {
      await sql`delete from entries`.execute(tx);
    }),
  );

  const rows = await sql`select id from entries`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([]);
});

test('it creates the triggers again once the callback returns', async () => {
  const ctx = await setupTest();

  await sql`insert into entries (id) values (1)`.execute(ctx.db);
  await ctx.db.transaction().execute((tx) => withTriggersDropped(tx, () => Promise.resolve()));

  const remove = sql`delete from entries`.execute(ctx.db);

  await Promise.allSettled([remove]);

  expect(remove).rejects.toThrowWithMessage(Error, 'entries are append-only');
});

test('it keeps the triggers when the callback throws', async () => {
  const ctx = await setupTest();

  await sql`insert into entries (id) values (1)`.execute(ctx.db);
  const run = ctx.db
    .transaction()
    .execute((tx) =>
      withTriggersDropped(tx, () => Promise.reject(new Error('the callback failed'))),
    );

  await Promise.allSettled([run]);

  const triggers = await sql`select name from sqlite_master where type = 'trigger'`.execute(ctx.db);

  expect(run).rejects.toThrowWithMessage(Error, 'the callback failed');
  expect(triggers.rows).toStrictEqual([{ name: 'entries_refuse_delete' }]);
});

test('it lets a row point at a removed row until a later statement in the transaction points it at a new one', async () => {
  const ctx = await setupTest();

  await sql`insert into entries (id) values (1)`.execute(ctx.db);
  await sql`insert into pins (pin, entry) values ('kept', 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) =>
    withTriggersDropped(tx, async () => {
      await sql`delete from entries`.execute(tx);
      await sql`insert into entries (id) values (2)`.execute(tx);
      await sql`update pins set entry = 2`.execute(tx);
    }),
  );

  const pins = await sql`select pin, entry from pins`.execute(ctx.db);

  expect(pins.rows).toStrictEqual([{ pin: 'kept', entry: 2 }]);
});

test('it refuses the commit while a row still points at a removed row', async () => {
  const ctx = await setupTest();

  await sql`insert into entries (id) values (1)`.execute(ctx.db);
  await sql`insert into pins (pin, entry) values ('kept', 1)`.execute(ctx.db);

  const committed = ctx.db.transaction().execute((tx) =>
    withTriggersDropped(tx, async () => {
      await sql`delete from entries`.execute(tx);
    }),
  );

  await Promise.allSettled([committed]);

  expect(committed).rejects.toThrowWithMessage(Error, /FOREIGN KEY constraint failed/u);
});
