// `bun libs/db/src/run-schema-report.ts` prints this tree's schema as the migration check reads it
// with --released: each migration's name, the oldest reader, and the schema objects they build.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nixieSchema } from './nixie-schema';
import { readSchemaObjects } from './read-schema-objects';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';

const dir = await mkdtemp(join(tmpdir(), 'nixie-schema-report-'));
const db = startDatabase(join(dir, 'schema-report.db'));

await runMigrations(db, { schema: nixieSchema, copyDir: dir });
const objects = await readSchemaObjects(db);

await db.destroy();
await rm(dir, { recursive: true, force: true });
process.stdout.write(
  `${JSON.stringify({
    migrations: nixieSchema.migrations.map((migration) => migration.name),
    oldestReader: nixieSchema.oldestReader,
    objects,
  })}\n`,
);
