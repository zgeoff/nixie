import type { BuildSchema, Migration } from '../types';

// The schema as a database holds it just before one migration runs, for a test of an older
// migration that reads the table shapes of its own time.
export function buildSchemaBefore(schema: BuildSchema, migration: Migration): BuildSchema {
  const index = schema.migrations.indexOf(migration);

  return { ...schema, migrations: schema.migrations.slice(0, index) };
}
