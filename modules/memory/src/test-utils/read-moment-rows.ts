import type { Kysely, Selectable } from 'kysely';
import type { MomentTables } from '../moment-types';

type Rows<Table extends keyof MomentTables> = readonly Selectable<MomentTables[Table]>[];

export interface MomentRows {
  readonly moments: Rows<'moments'>;
  readonly reflections: Rows<'moment_reflections'>;
  readonly links: Rows<'moment_links'>;
  readonly texts: Rows<'moment_texts'>;
}

export async function readMomentRows(db: Kysely<MomentTables>): Promise<MomentRows> {
  const moments = await db.selectFrom('moments').selectAll().orderBy('moment_id').execute();

  const reflections = await db
    .selectFrom('moment_reflections')
    .selectAll()
    .orderBy('reflection_id')
    .execute();

  const links = await db.selectFrom('moment_links').selectAll().orderBy('link_key').execute();
  const texts = await db.selectFrom('moment_texts').selectAll().orderBy('sequence').execute();

  return { moments, reflections, links, texts };
}
