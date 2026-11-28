import type { Kysely } from 'kysely';
import type { ImageTables } from './image-tables';

// The UUID of each image whose bytes sit in the record, which the record's forget takes first.
export async function readRecordImageUUIDs(
  db: Kysely<unknown>,
  sequence: number,
): Promise<readonly string[]> {
  const rows = await db
    .$extendTables<ImageTables>()
    .selectFrom('images')
    .select('uuid')
    .where('sequence', '=', sequence)
    .orderBy('position')
    .execute();

  return rows.map((row) => row.uuid);
}
