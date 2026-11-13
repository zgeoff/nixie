import { expect, test } from 'bun:test';
import { buildMigrations } from './build-migrations';

test('it returns the migrations in number order whatever the order of the files', () => {
  const migrations = buildMigrations([
    { fileName: '0003-c.ts', module: { migration: { name: 'third', up: async () => {} } } },
    { fileName: '0001-a.ts', module: { migration: { name: 'first', up: async () => {} } } },
    { fileName: '0002-b.ts', module: { migration: { name: 'second', up: async () => {} } } },
  ]);

  expect(migrations.map((migration) => migration.name)).toStrictEqual(['first', 'second', 'third']);
});

test('it returns no migrations for no files', () => {
  expect(buildMigrations([])).toStrictEqual([]);
});

test('it refuses 2 files with the same number', () => {
  expect(() =>
    buildMigrations([
      { fileName: '0001-a.ts', module: { migration: { name: 'first', up: async () => {} } } },
      { fileName: '0002-b.ts', module: { migration: { name: 'second', up: async () => {} } } },
      { fileName: '0002-c.ts', module: { migration: { name: 'also second', up: async () => {} } } },
    ]),
  ).toThrowWithMessage(Error, /0002-b\.ts and 0002-c\.ts share number 2/u);
});

test('it refuses a gap in the numbers', () => {
  expect(() =>
    buildMigrations([
      { fileName: '0001-a.ts', module: { migration: { name: 'first', up: async () => {} } } },
      { fileName: '0003-c.ts', module: { migration: { name: 'third', up: async () => {} } } },
    ]),
  ).toThrowWithMessage(Error, /0003-c\.ts follows number 1/u);
});

test('it refuses numbers that do not start at 1', () => {
  expect(() =>
    buildMigrations([
      { fileName: '0002-b.ts', module: { migration: { name: 'second', up: async () => {} } } },
    ]),
  ).toThrowWithMessage(Error, /0002-b\.ts follows number 0/u);
});

test('it refuses a file whose name has no number', () => {
  expect(() =>
    buildMigrations([
      { fileName: '0001-a.ts', module: { migration: { name: 'first', up: async () => {} } } },
      { fileName: 'helper.ts', module: { migration: { name: 'helper', up: async () => {} } } },
    ]),
  ).toThrowWithMessage(Error, /helper\.ts is not named/u);
});

test('it refuses a file with no export', () => {
  expect(() => buildMigrations([{ fileName: '0001-a.ts', module: {} }])).toThrowWithMessage(
    Error,
    /0001-a\.ts must have exactly one export, found 0/u,
  );
});

test('it refuses a file with 2 exports', () => {
  expect(() =>
    buildMigrations([
      {
        fileName: '0001-a.ts',
        module: {
          one: { name: 'first', up: async () => {} },
          two: { name: 'again', up: async () => {} },
        },
      },
    ]),
  ).toThrowWithMessage(Error, /0001-a\.ts must have exactly one export, found 2/u);
});

test.each([
  { kind: 'a string', value: 'first' },
  { kind: 'an object with no up', value: { name: 'first' } },
  { kind: 'an object with an empty name', value: { name: '', up: async () => {} } },
  { kind: 'an object whose up is not a function', value: { name: 'first', up: 'sql' } },
])('it refuses a file that exports $kind', (row) => {
  expect(() =>
    buildMigrations([{ fileName: '0001-a.ts', module: { value: row.value } }]),
  ).toThrowWithMessage(Error, /0001-a\.ts must export a migration/u);
});

test('it refuses a file whose module is not an object', () => {
  expect(() => buildMigrations([{ fileName: '0001-a.ts', module: null }])).toThrowWithMessage(
    Error,
    /0001-a\.ts must have exactly one export, found 0/u,
  );
});
