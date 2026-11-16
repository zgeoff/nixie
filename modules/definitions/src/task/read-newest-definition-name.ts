import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { DefinitionsTables } from '../types';

const nameSchema = z.looseObject({ name: z.string() });

// The name in the newest stored version of the definition, or null when none is stored.
export async function readNewestDefinitionName(
  db: Kysely<unknown>,
  definitionID: string,
): Promise<string | null> {
  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select('form')
    .where('definition_id', '=', definitionID)
    .orderBy(sql`rowid`, 'desc')
    .executeTakeFirst();

  return row === undefined ? null : nameSchema.parse(JSON.parse(row.form)).name;
}
