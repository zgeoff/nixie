import { readIndexRows } from '../index-block/read-index-rows';
import type { StoreParts } from '../types';
import type { UsageListEntry } from './collect-usage-list';
import { collectUsageList } from './collect-usage-list';
import { readMemoryUsage } from './read-memory-usage';
import { readSavedTimes } from './read-saved-times';

export interface UsageListRequest {
  readonly days: number;

  // only records before this sequence count, so the call's own records stay out
  readonly beforeSequence: number;
}

// The active items that no search or push surfaced in the last `days` days. Pinned items and
// lapsed items are left out: the session's opening holds a pinned item, and a lapsed item surfaces
// nowhere.
export async function readUsageList(
  parts: StoreParts,
  request: UsageListRequest,
): Promise<readonly UsageListEntry[]> {
  const nowMs = parts.context.gate.clock.now();

  const rows = await parts.lock(() => readIndexRows(parts));
  const usage = await readMemoryUsage(parts, request.beforeSequence);

  const savedTimes = await readSavedTimes(
    parts,
    rows.map((row) => row.itemID),
  );

  const triggers = new Map(
    rows.map((row) => [row.itemID, parts.labels.find(row.itemID)?.triggers ?? []] as const),
  );

  return collectUsageList({ rows, triggers, usage, savedTimes }, request.days, nowMs);
}
