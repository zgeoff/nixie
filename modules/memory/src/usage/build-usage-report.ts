import type { ItemUsage, ItemUsageReport, MemoryUsage } from './types';

const noUsage: ItemUsage = {
  searched: 0,
  pushed: 0,
  lastSurfacedAtMs: null,
  lastRecalledByIDAtMs: null,
  firedTriggers: [],
  hasUnkeyedPush: false,
};

interface UsageItem {
  readonly itemID: string;
  readonly savedAtMs: number | undefined;
}

// The counts start at the log's earliest usage record. When that record is later than the item's
// save, the counts miss the time between, so the report carries the date they start from.
export function buildUsageReport(usage: MemoryUsage, item: UsageItem): ItemUsageReport {
  const earliest = usage.earliestAtMs;
  const isPartial = earliest !== null && item.savedAtMs !== undefined && earliest > item.savedAtMs;

  return { ...(usage.items.get(item.itemID) ?? noUsage), sinceMs: isPartial ? earliest : null };
}
