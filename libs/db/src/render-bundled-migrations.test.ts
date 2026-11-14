import { expect, test } from 'bun:test';
import { renderBundledMigrations } from './render-bundled-migrations';

test('it replaces the directory read with one static import per file', () => {
  const schemaSource = `import { join } from 'node:path';
import { readMigrations } from './read-migrations';

export const nixieSchema = {
  migrations: await readMigrations(join(import.meta.dir, 'migrations')),
  oldestReader: 35,
};
`;

  expect(
    renderBundledMigrations(schemaSource, '/src/migrations', '/src/build-migrations.ts', [
      '0001-a.ts',
      '0002-b.ts',
    ]),
  ).toStrictEqual(`import * as migration0 from "/src/migrations/0001-a.ts";
import * as migration1 from "/src/migrations/0002-b.ts";
import { buildMigrations } from "/src/build-migrations.ts";
import { join } from 'node:path';

export const nixieSchema = {
  migrations: buildMigrations([{ fileName: "0001-a.ts", module: migration0 }, { fileName: "0002-b.ts", module: migration1 }]),
  oldestReader: 35,
};
`);
});

test('it refuses a schema module that no longer reads the folder as expected', () => {
  expect(() =>
    renderBundledMigrations('export const nixieSchema = {};', '/m', '/b.ts', ['0001-a.ts']),
  ).toThrowWithMessage(Error, /no longer calls readMigrations/u);
});
