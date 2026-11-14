import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { readBuiltTables } from './read-built-tables';

test('it reads each table the migrations build with its columns in declared order', async () => {
  const tables = await readBuiltTables({
    migrations: [
      {
        name: 'create plants',
        up: async (tx) => {
          await sql`create table plants (
            plant_id text primary key,
            name text not null,
            height real,
            photo blob not null
          ) strict`.execute(tx);
        },
      },
      {
        name: 'create beds',
        up: async (tx) => {
          await sql`create table beds (bed_id integer primary key, notes text) strict`.execute(tx);

          await sql`alter table plants add column bed_id integer references beds (bed_id)`.execute(
            tx,
          );
        },
      },
    ],
    oldestReader: 0,
  });

  expect(tables).toStrictEqual([
    {
      name: 'beds',
      columns: [
        { name: 'bed_id', type: 'integer', isNullable: false },
        { name: 'notes', type: 'text', isNullable: true },
      ],
    },
    {
      name: 'plants',
      columns: [
        { name: 'plant_id', type: 'text', isNullable: false },
        { name: 'name', type: 'text', isNullable: false },
        { name: 'height', type: 'real', isNullable: true },
        { name: 'photo', type: 'blob', isNullable: false },
        { name: 'bed_id', type: 'integer', isNullable: true },
      ],
    },
  ]);
});

test('it lowercases a column type the migration declares in capitals', async () => {
  const tables = await readBuiltTables({
    migrations: [
      {
        name: 'create seeds',
        up: async (tx) => {
          await sql`create table seeds (seed_id TEXT NOT NULL)`.execute(tx);
        },
      },
    ],
    oldestReader: 0,
  });

  expect(tables).toStrictEqual([
    { name: 'seeds', columns: [{ name: 'seed_id', type: 'text', isNullable: false }] },
  ]);
});
