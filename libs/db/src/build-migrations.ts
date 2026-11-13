import { parseMigrationFileName } from './parse-migration-file-name';
import type { Migration } from './types';

export interface MigrationFile {
  readonly fileName: string;

  readonly module: unknown;
}

export function buildMigrations(files: readonly MigrationFile[]): readonly Migration[] {
  const numbered = files
    .map((file) => ({ file, number: pickNumber(file.fileName), migration: pickMigration(file) }))
    .toSorted((left, right) => left.number - right.number);

  for (const [index, entry] of numbered.entries()) {
    const previous = numbered[index - 1];

    if (previous?.number === entry.number) {
      throw new Error(
        `Migration files ${previous.file.fileName} and ${entry.file.fileName} share number ${entry.number}`,
      );
    }

    if (entry.number !== index + 1) {
      throw new Error(
        `Migration numbers must run from 1 with no gap: ${entry.file.fileName} follows number ${index}`,
      );
    }
  }

  return numbered.map((entry) => entry.migration);
}

function pickNumber(fileName: string): number {
  const number = parseMigrationFileName(fileName);

  if (number === null) {
    throw new Error(`Migration file ${fileName} is not named NNNN-name.ts`);
  }

  return number;
}

function pickMigration(file: MigrationFile): Migration {
  const exported: unknown[] =
    typeof file.module === 'object' && file.module !== null ? Object.values(file.module) : [];

  const [migration] = exported;

  if (exported.length !== 1) {
    throw new Error(
      `Migration file ${file.fileName} must have exactly one export, found ${exported.length}`,
    );
  }

  if (!isMigration(migration)) {
    throw new Error(`Migration file ${file.fileName} must export a migration`);
  }

  return migration;
}

function isMigration(value: unknown): value is Migration {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name !== '' &&
    'up' in value &&
    typeof value.up === 'function'
  );
}
