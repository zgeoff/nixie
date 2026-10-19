import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nixieSchema } from './nixie-schema';
import type { MemorySubjectCounts } from './read-memory-subject-counts';
import { readMemorySubjectCounts } from './read-memory-subject-counts';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';

// What the subjects migration would do to a database: the schema version it starts at and ends
// at, and the count of each subject before and after.
export interface SubjectMigrationReport {
  readonly from: number;
  readonly to: number;
  readonly before: MemorySubjectCounts;
  readonly after: MemorySubjectCounts;
}

// Runs every migration this build writes on a copy of the database at path, such as a backup, and
// reports the subject counts before and after. It reads the original only through a read-only
// connection, whose copy is one snapshot, so a server that writes meanwhile never splits the copy.
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

// copies the database, with the writes its log holds, in one read transaction
function createSnapshotCopy(path: string, copyPath: string): void {
  const source = new Database(path, { readonly: true });

  try {
    source.run('vacuum into ?', [copyPath]);
  } finally {
    source.close();
  }
}
