import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from './database/start-database';
import { runMigrations } from './migration/run-migrations';
import { nixieSchema } from './schema/nixie-schema';
import { readSchemaObjects } from './schema/read-schema-objects';

const directory = await mkdtemp(join(tmpdir(), 'nixie-schema-report-'));

const db = startDatabase(join(directory, 'schema-report.db'));

await runMigrations(db, { schema: nixieSchema, copyDir: directory });

const objects = await readSchemaObjects(db);

await db.destroy();

await rm(directory, { recursive: true, force: true });

process.stdout.write(
  `${JSON.stringify({
    migrations: nixieSchema.migrations.map((migration) => migration.name),
    oldestReader: nixieSchema.oldestReader,
    objects,
  })}\n`,
);
