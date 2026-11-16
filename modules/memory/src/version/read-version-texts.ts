import type { Log } from '@heynixie/log';
import type { MemoryTables, VersionRef } from '../types';
import { readVersionValues } from './read-version-values';

export type VersionTextResult = VersionRef &
  (
    | { readonly status: 'readable'; readonly text: string }
    | { readonly status: 'shredded' | 'unreadable' | 'missing' }
  );

export function readVersionTexts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  refs: readonly VersionRef[],
): Promise<readonly VersionTextResult[]> {
  return Promise.all(refs.map((ref) => readVersionText(log, ref)));
}

// A version that a purge removed reads as shredded, as every API status does.
async function readVersionText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: VersionRef,
): Promise<VersionTextResult> {
  const base = { itemID: ref.itemID, version: ref.version };

  const row = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['item_id', 'version', 'sequence', 'sealed', 'evidence', 'intent_evidence'])
    .where('item_id', '=', ref.itemID)
    .where('version', '=', ref.version)
    .executeTakeFirst();

  if (row === undefined) {
    return { ...base, status: 'missing' };
  }

  const [value] = await readVersionValues(log, log.writer.db, [row]);

  if (value?.status === 'readable') {
    return { ...base, status: 'readable', text: value.text.text };
  }

  return { ...base, status: value?.status === 'unreadable' ? 'unreadable' : 'shredded' };
}
