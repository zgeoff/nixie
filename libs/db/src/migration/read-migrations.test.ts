import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrations } from './read-migrations';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-migrations-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    writeMigration: (fileName: string, name: string) =>
      writeFile(
        join(directory, fileName),
        `export const migration = { name: ${JSON.stringify(name)}, up: async () => {} };\n`,
      ),
  };
}

test('it loads each numbered file of the folder in number order', async () => {
  const ctx = await setupTest();

  await ctx.writeMigration('0002-second.ts', 'second');
  await ctx.writeMigration('0001-first.ts', 'first');

  await writeFile(join(ctx.directory, '0001-first.test.ts'), 'throw new Error("not loaded");\n');

  const migrations = await readMigrations(ctx.directory);

  expect(migrations.map((migration) => migration.name)).toStrictEqual(['first', 'second']);
});

test('it loads one added file with no other edit', async () => {
  const ctx = await setupTest();

  await ctx.writeMigration('0001-first.ts', 'first');
  await ctx.writeMigration('0002-second.ts', 'second');
  await ctx.writeMigration('0003-third.ts', 'third');

  const migrations = await readMigrations(ctx.directory);

  expect(migrations.map((migration) => migration.name)).toStrictEqual(['first', 'second', 'third']);
});

test('it refuses 2 files that took the same number', async () => {
  const ctx = await setupTest();

  await ctx.writeMigration('0001-first.ts', 'first');
  await ctx.writeMigration('0002-second.ts', 'second');
  await ctx.writeMigration('0002-other.ts', 'other');

  expect(readMigrations(ctx.directory)).rejects.toThrow(/share number 2/u);
});

test('it refuses a file that is not a numbered migration', async () => {
  const ctx = await setupTest();

  await ctx.writeMigration('0001-first.ts', 'first');

  await writeFile(join(ctx.directory, 'helper.ts'), 'export const helper = 1;\n');

  expect(readMigrations(ctx.directory)).rejects.toThrow(/helper\.ts is not named/u);
});
