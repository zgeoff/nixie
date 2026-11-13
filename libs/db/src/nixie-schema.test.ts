import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collectMigrationFileNames } from './collect-migration-file-names';
import { nixieSchema } from './nixie-schema';
import { parseMigrationFileName } from './parse-migration-file-name';
import { releasedMigrations } from './test-utils/released-migrations';

test('it loads the released migrations in their released order and names', () => {
  expect(
    nixieSchema.migrations.slice(0, releasedMigrations.length).map((migration) => migration.name),
  ).toStrictEqual(releasedMigrations.map((migration) => migration.name));
});

test('it numbers each released migration file by its position', async () => {
  const entries = await readdir(join(import.meta.dir, 'migrations'));

  const fileNames = collectMigrationFileNames(entries);

  expect(
    fileNames
      .slice(0, releasedMigrations.length)
      .map((fileName, index) => [fileName, parseMigrationFileName(fileName) === index + 1]),
  ).toStrictEqual(releasedMigrations.map((released) => [released.fileName, true]));
});

test('it keeps 35 as the oldest reader', () => {
  expect(nixieSchema.oldestReader).toBe(35);
});
