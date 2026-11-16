import type { PurgeFacts } from './read-purge-facts';

export type PurgePlan =
  | { readonly kind: 'skip' }
  | { readonly kind: 'finish'; readonly closedSequence: number }
  | { readonly kind: 'lapse' }
  | {
      readonly kind: 'close';

      // the generation key in force, and every version key but the current one's
      readonly closedKeyIDs: readonly string[];

      // whether the current text shares the generation key, so a bridge version keeps it
      readonly isShared: boolean;
    };

// skip: the item is forgetting, forgotten or already purged, or the set holds no row for it.
// finish: the closing record is in the log, so the keys go and the last mark follows.
// lapse: a pending proposal for a new item lapses, and nothing else of the item exists.
export function pickPurgePlan(facts: PurgeFacts): PurgePlan {
  if (facts.purge === null || facts.purge.purgedSequence !== null) {
    return { kind: 'skip' };
  }

  if (facts.purge.closedSequence !== null) {
    return { kind: 'finish', closedSequence: facts.purge.closedSequence };
  }

  if (facts.item === null) {
    return { kind: 'lapse' };
  }

  if (facts.item.state === 'forgetting' || facts.item.state === 'forgotten') {
    return { kind: 'skip' };
  }

  const open = facts.keyRows.filter((row) => row.removed_sequence === null);
  const current = facts.item.version;

  const [generation] = open
    .filter((row) => row.kind === 'generation')
    .toSorted((first, second) => second.from_sequence - first.from_sequence);

  const versionKeys = open.filter((row) => row.kind === 'version');

  return {
    kind: 'close',
    closedKeyIDs: [
      generation?.key_id ?? facts.itemID,
      ...versionKeys.filter((row) => row.version !== current).map((row) => row.key_id),
    ],
    isShared: !versionKeys.some((row) => row.version === current),
  };
}
