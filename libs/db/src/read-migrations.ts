import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MigrationFile } from './build-migrations';
import { buildMigrations } from './build-migrations';
import { collectMigrationFileNames } from './collect-migration-file-names';
import type { Migration } from './types';

export async function readMigrations(directory: string): Promise<readonly Migration[]> {
  const entries = await readdir(directory);

  const fileNames = collectMigrationFileNames(entries);

  const files: MigrationFile[] = await Promise.all(
    fileNames.map(async (fileName) => {
      // oxlint-disable-next-line zgeoff/import-zones -- the folder holds only migration files, which import no restricted package
      const module: unknown = await import(join(directory, fileName));

      return { fileName, module };
    }),
  );

  return buildMigrations(files);
}
