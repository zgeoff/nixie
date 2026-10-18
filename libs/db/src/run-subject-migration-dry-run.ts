import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemorySubjectCounts } from './count-memory-subjects';
import { countMemorySubjects } from './count-memory-subjects';
import { nixieSchema } from './nixie-schema';
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
// reports the subject counts before and after. It copies the file and its write-ahead log byte for
// byte and never opens the original, so the dry run leaves the database as it found it.
export async function runSubjectMigrationDryRun(path: string): Promise<SubjectMigrationReport> {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-subjects-dry-run-'));

  try {
    const copyPath = join(dir, 'nixie.db');

    await copyFile(path, copyPath);
    await createWriteAheadLogCopy(path, copyPath);

    const db = startDatabase(copyPath);

    try {
      const before = await countMemorySubjects(db);
      const migration = await runMigrations(db, { schema: nixieSchema, copyDir: dir });
      const after = await countMemorySubjects(db);

      return { from: migration.from, to: migration.to, before, after };
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// a database closed uncleanly keeps writes in its log, which the copy needs to count them
async function createWriteAheadLogCopy(path: string, copyPath: string): Promise<void> {
  const log = await stat(`${path}-wal`).catch(() => null);

  if (log !== null) {
    await copyFile(`${path}-wal`, `${copyPath}-wal`);
  }
}
