import type { Log } from '@heynixie/log';
import type { ItemLinkCount, ItemLinkCounts } from '@heynixie/memory';
import type { NotebookTables } from '../types';

const chunkSize = 400;

// How many active notes dispute or supersede each item, private notes included. It reads the
// tables alone, so memory can hold it before the notebook starts, and a count drops on its own when
// a note is unlinked or forgotten.
export function buildItemLinkCounts(log: Pick<Log, 'writer'>): ItemLinkCounts {
  return {
    readCounts: async (itemIDs) => {
      const counts = new Map<string, ItemLinkCount>();

      for (let start = 0; start < itemIDs.length; start += chunkSize) {
        const rows = await log.writer.db
          .$extendTables<NotebookTables>()
          .selectFrom('notebook_links')
          .innerJoin('notebook_notes', 'notebook_notes.note_id', 'notebook_links.from_note_id')
          .select(['notebook_links.target_id', 'notebook_links.type'])
          .where('notebook_links.target_kind', '=', 'memory')
          .where('notebook_links.target_id', 'in', itemIDs.slice(start, start + chunkSize))
          .where('notebook_links.type', 'in', ['disputes', 'supersedes'])
          .where('notebook_notes.state', '=', 'active')
          .execute();

        for (const row of rows) {
          const current = counts.get(row.target_id) ?? { disputedBy: 0, supersededBy: 0 };

          counts.set(row.target_id, {
            disputedBy: current.disputedBy + (row.type === 'disputes' ? 1 : 0),
            supersededBy: current.supersededBy + (row.type === 'supersedes' ? 1 : 0),
          });
        }
      }

      return counts;
    },
  };
}
