import type { Log } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import type { MemoryTables, MemoryVersionRow, VersionRef, VersionText } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { VersionRemovedError } from '../utils/error/version-removed-error';
import { readVersionValues } from './read-version-values';

export interface ReadableVersion {
  readonly row: MemoryVersionRow;
  readonly text: VersionText;
}

// Throws VersionRemovedError for a version that a purge removed, and MemoryItemNotFoundError for
// one whose key is gone or fails to open.
export async function readVersion(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  db: Kysely<unknown>,
  ref: VersionRef,
): Promise<ReadableVersion> {
  const row = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', ref.itemID)
    .where('version', '=', ref.version)
    .executeTakeFirst();

  invariant(row, `memory item ${ref.itemID} has no version ${String(ref.version)}`);

  const [value] = await readVersionValues(log, db, [row]);

  if (value?.status === 'removed') {
    throw new VersionRemovedError(ref);
  }

  if (value?.status !== 'readable') {
    throw new MemoryItemNotFoundError(ref.itemID);
  }

  return { row, text: value.text };
}
