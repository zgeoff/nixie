import { isIndexedMomentState } from './is-indexed-moment-state';
import type { MomentRow } from './read-moment-row';
import type { IndexEntry } from './start-memory-index';

export interface MomentEntries {
  readonly entries: readonly IndexEntry[];
  readonly removedIDs: readonly string[];
  readonly through: number;
}

export function collectMomentEntries(
  rows: readonly MomentRow[],
  texts: ReadonlyMap<string, string>,
  afterSequence: number,
): MomentEntries {
  const entries = rows.flatMap((row) => {
    const text = texts.get(row.moment_id) ?? '';

    return isIndexedMomentState(row.state) && text.trim() !== ''
      ? [{ itemID: row.moment_id, text }]
      : [];
  });

  const indexed = new Set(entries.map((entry) => entry.itemID));

  return {
    entries,
    removedIDs: rows.map((row) => row.moment_id).filter((momentID) => !indexed.has(momentID)),
    through: Math.max(afterSequence, ...rows.map((row) => row.updated_sequence)),
  };
}
