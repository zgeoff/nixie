import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { decodeVersionText } from './decode-version-text';
import type { MemoryTables, MemoryVersionRow, VersionRef, VersionText } from './types';

export interface ReadableVersion {
  readonly row: MemoryVersionRow;
  readonly text: VersionText;
}

// Reads one version of an item that the caller already holds the key of, and decrypts its text.
// The caller passes a version the item's row says exists.
export async function readVersion(
  db: Kysely<MemoryTables>,
  key: CryptoKey,
  ref: VersionRef,
): Promise<ReadableVersion> {
  const row = await db
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', ref.itemID)
    .where('version', '=', ref.version)
    .executeTakeFirst();

  invariant(row, `memory item ${ref.itemID} has no version ${String(ref.version)}`);

  return { row, text: await decodeVersionText(key, ref, row.sealed) };
}
