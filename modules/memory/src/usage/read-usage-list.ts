import { readIndexRows } from '../index-block/read-index-rows';
import type { StoreParts } from '../types';
import type { UsageListEntry } from './collect-usage-list';
import { collectUsageList } from './collect-usage-list';
import { readMemoryUsage } from './read-memory-usage';
import { readPhraseAddedTimes } from './read-phrase-added-times';
import { readSavedTimes } from './read-saved-times';

export interface UsageListRequest {
  readonly days: number;

  // only records before this sequence count, so the call's own records stay out
  readonly beforeSequence: number;
}

// The active items that no search or push surfaced in the last `days` days, pinned items too. The
// history is read outside the lock, so the rows are read again under it: an item forgotten
// meanwhile is gone, and no row carries its old gist.
export async function readUsageList(
  parts: StoreParts,
  request: UsageListRequest,
): Promise<readonly UsageListEntry[]> {
  const nowMs = parts.context.gate.clock.now();

  const listed = await parts.lock(() => readIndexRows(parts, { isPinnedIncluded: true }));
  const usage = await readMemoryUsage(parts, request.beforeSequence);

  const savedTimes = await readSavedTimes(
    parts,
    listed.map((row) => row.itemID),
  );

  const phraseAddedTimes = await readPhraseAddedTimes(
    parts,
    listed.map((row) => row.itemID),
  );

  const current = await parts.lock(async () => {
    const found = await readIndexRows(parts, { isPinnedIncluded: true });

    return {
      rows: found,
      triggers: new Map(
        found.map((row) => [row.itemID, parts.labels.find(row.itemID)?.triggers ?? []] as const),
      ),
    };
  });

  return collectUsageList(
    { rows: current.rows, triggers: current.triggers, usage, savedTimes, phraseAddedTimes },
    request.days,
    nowMs,
  );
}
