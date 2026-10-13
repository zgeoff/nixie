import type { Log } from '@heynixie/log';
import { decodeVersionText } from './decode-version-text';
import { findItemKey } from './find-item-key';
import type { MemoryTables, VersionRef } from './types';

// The text of one named version as a view shows it. A version whose key is gone reads as
// shredded, one whose key or ciphertext fails reads as unreadable, and one that never existed reads
// as missing.
export type VersionTextResult = VersionRef &
  (
    | { readonly status: 'readable'; readonly text: string }
    | { readonly status: 'shredded' | 'unreadable' | 'missing' }
  );

// Reads the text of the named versions, in the order named, so a view can show what a recall
// delivered. It delivers nothing to a task, so it takes no lock and writes no record.
export function readVersionTexts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  refs: readonly VersionRef[],
): Promise<readonly VersionTextResult[]> {
  return Promise.all(refs.map((ref) => readVersionText(log, ref)));
}

async function readVersionText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: VersionRef,
): Promise<VersionTextResult> {
  const base = { itemID: ref.itemID, version: ref.version };
  const row = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('sealed')
    .where('item_id', '=', ref.itemID)
    .where('version', '=', ref.version)
    .executeTakeFirst();

  if (row === undefined) {
    return { ...base, status: 'missing' };
  }
  const key = await findItemKey(log, ref.itemID);

  if (key === undefined) {
    return { ...base, status: 'shredded' };
  }
  return key === null ? { ...base, status: 'unreadable' } : decodeText(key, base, row.sealed);
}

async function decodeText(
  key: CryptoKey,
  ref: VersionRef,
  sealed: string,
): Promise<VersionTextResult> {
  try {
    const text = await decodeVersionText(key, ref, sealed);

    return { ...ref, status: 'readable', text: text.text };
  } catch {
    return { ...ref, status: 'unreadable' };
  }
}
