import type { Log } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import { readMomentText } from './read-moment-text';

export interface MomentLink {
  readonly momentID: string;
  readonly title: string;
}

// Each link names its moment by short ID and title only, never by the moment's note or reflections.
export async function readMomentLinks(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, readonly MomentLink[]>> {
  if (itemIDs.length === 0) {
    return new Map();
  }

  const rows = await log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moment_links')
    .innerJoin('moments', 'moments.moment_id', 'moment_links.moment_id')
    .select(['moment_links.item_id', 'moments.short_id', 'moments.title_sequence'])
    .where('moment_links.item_id', 'in', itemIDs)
    .where('moments.state', '=', 'active')
    .orderBy('moment_links.linked_sequence')
    .execute();

  const titles = await Promise.all(
    rows.map((row) => readMomentText(log, row.title_sequence, 'title')),
  );

  const links = new Map<string, MomentLink[]>();

  for (const [index, row] of rows.entries()) {
    const title = titles[index];

    if (typeof title === 'string') {
      links.set(row.item_id, [
        ...(links.get(row.item_id) ?? []),
        { momentID: row.short_id, title },
      ]);
    }
  }

  return links;
}
