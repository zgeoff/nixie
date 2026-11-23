import type { IndexRow } from '../index-block/read-index-rows';
import type { MemorySubject } from '../types';
import { buildUsageReport } from './build-usage-report';
import type { ItemUsageReport, MemoryUsage } from './types';

export interface UsageListEntry {
  // the short ID
  readonly itemID: string;

  // the item's UUID, which the model never reads
  readonly itemUUID: string;
  readonly subject: MemorySubject;
  readonly topic: string;
  readonly gist: string;

  // the trigger phrases of an item that no push ever placed, so none of them ever fired
  readonly neverFiredTriggers: readonly string[];
  readonly report: ItemUsageReport;
}

export interface UsageListInput {
  readonly rows: readonly IndexRow[];
  readonly triggers: ReadonlyMap<string, readonly string[]>;
  readonly usage: MemoryUsage;
  readonly savedTimes: ReadonlyMap<string, number>;
}

const dayMs = 24 * 60 * 60 * 1000;

// The items that no search or push surfaced since the cutoff, the never-surfaced first and then the
// longest unsurfaced, with the older item first on a tie.
export function collectUsageList(
  input: UsageListInput,
  days: number,
  nowMs: number,
): readonly UsageListEntry[] {
  const cutoffMs = nowMs - days * dayMs;

  return input.rows
    .flatMap((row) => {
      const report = buildUsageReport(input.usage, {
        itemID: row.itemID,
        savedAtMs: input.savedTimes.get(row.itemID),
      });

      const isStale = report.lastSurfacedAtMs === null || report.lastSurfacedAtMs < cutoffMs;

      return isStale ? [{ row, report }] : [];
    })
    .toSorted(
      (left, right) =>
        compareSurfaced(left.report.lastSurfacedAtMs, right.report.lastSurfacedAtMs) ||
        left.row.createdSequence - right.row.createdSequence,
    )
    .map((stale): UsageListEntry => ({
      itemID: stale.row.shortID,
      itemUUID: stale.row.itemID,
      subject: stale.row.subject,
      topic: stale.row.topic,
      gist: stale.row.gist,
      neverFiredTriggers:
        stale.report.pushed === 0 ? (input.triggers.get(stale.row.itemID) ?? []) : [],
      report: stale.report,
    }));
}

function compareSurfaced(left: number | null, right: number | null): number {
  if (left === null || right === null) {
    return Number(left !== null) - Number(right !== null);
  }

  return left - right;
}
