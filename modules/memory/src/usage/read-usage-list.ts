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

// The active, unpinned items that no search or push surfaced in the last `days` days. The history
// is read outside the lock. The rows, their triggers and their times are read after it under one
// lock, so a forgotten item is gone and every listed item has its created day.
export async function readUsageList(
  parts: StoreParts,
  request: UsageListRequest,
): Promise<readonly UsageListEntry[]> {
  const nowMs = parts.context.gate.clock.now();

  const usage = await readMemoryUsage(parts, request.beforeSequence);

  const current = await parts.lock(async () => {
    const rows = await readIndexRows(parts, { isPinnedIncluded: false });

    const itemIDs = rows.map((row) => row.itemID);

    return {
      rows,
      triggers: new Map(
        rows.map((row) => [row.itemID, parts.labels.find(row.itemID)?.triggers ?? []] as const),
      ),
      savedTimes: await readSavedTimes(parts, itemIDs),
      phraseAddedTimes: await readPhraseAddedTimes(parts, itemIDs),
    };
  });

  return collectUsageList({ ...current, usage }, request.days, nowMs);
}
