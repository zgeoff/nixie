import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';

export interface BridgeMarks {
  // the bridge version of each item that a purge wrote one for
  readonly versions: ReadonlyMap<string, ReadonlySet<number>>;

  // the revision of each item's label reseal
  readonly labelRevisions: ReadonlyMap<string, ReadonlySet<number>>;
}

// A purge writes a bridge version and a label reseal that carry the owner's change and origin, so
// a reader that shows who changed a value asks here first.
export async function readBridgeMarks(
  db: Kysely<unknown>,
  itemIDs: readonly string[],
): Promise<BridgeMarks> {
  if (itemIDs.length === 0) {
    return { versions: new Map(), labelRevisions: new Map() };
  }

  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_evidence_purges')
    .select(['item_id', 'bridge_version', 'labels_revision'])
    .where('item_id', 'in', itemIDs)
    .where('closed_sequence', 'is not', null)
    .execute();

  const versions = new Map<string, Set<number>>();
  const labelRevisions = new Map<string, Set<number>>();

  for (const row of rows) {
    if (row.bridge_version !== null) {
      versions.set(
        row.item_id,
        new Set([...(versions.get(row.item_id) ?? []), row.bridge_version]),
      );
    }

    if (row.labels_revision !== null) {
      labelRevisions.set(
        row.item_id,
        new Set([...(labelRevisions.get(row.item_id) ?? []), row.labels_revision]),
      );
    }
  }

  return { versions, labelRevisions };
}

export function isBridgeVersion(marks: BridgeMarks, itemID: string, version: number): boolean {
  return marks.versions.get(itemID)?.has(version) ?? false;
}

export function isBridgeLabels(marks: BridgeMarks, itemID: string, revision: number): boolean {
  return marks.labelRevisions.get(itemID)?.has(revision) ?? false;
}
