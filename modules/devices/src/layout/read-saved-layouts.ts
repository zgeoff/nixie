import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DeviceTables } from '../types';

const savedRegionsSchema = z.array(z.object({ region: z.string(), shownSequence: z.int() }));

export interface SavedLayout {
  readonly name: string;
  readonly layoutSequence: number;

  // the sequence of each region's content record, for each region that held content
  readonly regions: readonly { readonly region: string; readonly shownSequence: number }[];
  readonly savedAtMs: number;
}

// The layouts a device saved, by name. A saved layout holds sequences alone: the content stays in
// the records.
export async function readSavedLayouts(
  db: Kysely<unknown>,
  deviceID: string,
): Promise<readonly SavedLayout[]> {
  const rows = await db
    .$extendTables<DeviceTables>()
    .selectFrom('device_saved_layouts')
    .selectAll()
    .where('device_id', '=', deviceID)
    .orderBy('name')
    .execute();

  return rows.map((row) => ({
    name: row.name,
    layoutSequence: row.layout_sequence,
    regions: savedRegionsSchema.parse(JSON.parse(row.regions)),
    savedAtMs: row.saved_at,
  }));
}
