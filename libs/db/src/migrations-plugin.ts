import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BunPlugin } from 'bun';
import { collectMigrationFileNames } from './collect-migration-file-names';
import { renderBundledMigrations } from './render-bundled-migrations';

const schemaPath = join(import.meta.dir, 'nixie-schema.ts');

const schemaFilter = new RegExp(
  `^${schemaPath.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}$`,
  'u',
);

const migrationsDir = join(import.meta.dir, 'migrations');
const buildMigrationsPath = join(import.meta.dir, 'build-migrations.ts');

// Bun's bundler does not follow a computed import path, so the bundle takes each migration file
// by a static import that this plugin writes into the schema module.
export const migrationsPlugin: BunPlugin = {
  name: 'migrations',
  setup: (build) => {
    build.onLoad({ filter: schemaFilter }, async () => {
      const entries = await readdir(migrationsDir);

      const fileNames = collectMigrationFileNames(entries);

      const source = await Bun.file(schemaPath).text();

      return {
        contents: renderBundledMigrations(source, migrationsDir, buildMigrationsPath, fileNames),
        loader: 'ts',
      };
    });
  },
};
