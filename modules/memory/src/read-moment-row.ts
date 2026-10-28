import type { Kysely, Selectable } from 'kysely';
import type { MomentTables } from './moment-types';

export type MomentRow = Selectable<MomentTables['moments']>;

// A model names a moment by its short ID, and the client by its UUID.
export async function readMomentRow(
  db: Kysely<MomentTables>,
  momentID: string,
): Promise<MomentRow | null> {
  const row = await db
    .selectFrom('moments')
    .selectAll()
    .where((eb) => eb.or([eb('moment_id', '=', momentID), eb('short_id', '=', momentID)]))
    .executeTakeFirst();

  return row ?? null;
}
