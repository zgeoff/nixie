import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nixieSchema } from './nixie-schema';
import type { MemorySubjectCounts } from './read-memory-subject-counts';
import { readMemorySubjectCounts } from './read-memory-subject-counts';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';

export interface SubjectMigrationReport {
  readonly from: number;
  readonly to: number;
  readonly before: MemorySubjectCounts;
  readonly after: MemorySubjectCounts;
}

export async function runSubjectMigrationDryRun(path: string): Promise<SubjectMigrationReport> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-subjects-dry-run-'));

  try {
    const copyPath = join(directory, 'nixie.db');

    createSnapshotCopy(path, copyPath);

    const db = startDatabase(copyPath);

    try {
      const before = await readMemorySubjectCounts(db);
      const migration = await runMigrations(db, { schema: nixieSchema, copyDir: directory });
      const after = await readMemorySubjectCounts(db);

      return { from: migration.from, to: migration.to, before, after };
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createSnapshotCopy(path: string, copyPath: string): void {
  const source = new Database(path, { readonly: true });

  try {
    source.run('vacuum into ?', [copyPath]);
  } finally {
    source.close();
  }
}
