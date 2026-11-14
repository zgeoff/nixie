import { sql } from 'kysely';
import type { BuildSchema, Migration } from '../types';

export function buildGrowingSchema(count: number): BuildSchema {
  const migrations: Migration[] = Array.from({ length: count }, (_, index) => ({
    name: `create table ${index}`,
    up: async (tx) => {
      await sql`create table ${sql.table(`t${index}`)} (id text primary key)`.execute(tx);
    },
  }));

  return { migrations, oldestReader: 0 };
}
