import type { IndexRow } from '../index-block/read-index-rows';
import type { MemorySubject } from '../types';
import { buildTriggerKey } from '../utils/build-trigger-key';
import { buildUsageReport } from './build-usage-report';
import { compareUsagePosition } from './compare-usage-position';
import type { ItemUsageReport, MemoryUsage } from './types';

export interface UsageListEntry {
  // the short ID
  readonly itemID: string;

  // the item's UUID, which the model never reads
  readonly itemUUID: string;

  // the order of creation, the tiebreak of the list
  readonly createdSequence: number;
  readonly subject: MemorySubject;
  readonly topic: string;
  readonly gist: string;

  // when the item was first saved; null when no record of it is left
  readonly createdAtMs: number | null;

  // the trigger phrases that no push ever placed the item by
  readonly neverFiredTriggers: readonly string[];
  readonly report: ItemUsageReport;
}

export interface UsageListInput {
  readonly rows: readonly IndexRow[];
  readonly triggers: ReadonlyMap<string, readonly string[]>;
  readonly usage: MemoryUsage;
  readonly savedTimes: ReadonlyMap<string, number>;

  // the time each item's phrases first appeared, by item and then by phrase key
  readonly phraseAddedTimes: ReadonlyMap<string, ReadonlyMap<string, number>>;
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
    .toSorted((left, right) =>
      compareUsagePosition(
        { surfacedAtMs: left.report.lastSurfacedAtMs, createdSequence: left.row.createdSequence },
        { surfacedAtMs: right.report.lastSurfacedAtMs, createdSequence: right.row.createdSequence },
      ),
    )
    .map((stale): UsageListEntry => ({
      itemID: stale.row.shortID,
      itemUUID: stale.row.itemID,
      createdSequence: stale.row.createdSequence,
      subject: stale.row.subject,
      topic: stale.row.topic,
      gist: stale.row.gist,
      createdAtMs: input.savedTimes.get(stale.row.itemID) ?? null,
      neverFiredTriggers: collectNeverFired(
        input.triggers.get(stale.row.itemID) ?? [],
        stale.report,
        input.phraseAddedTimes.get(stale.row.itemID),
      ),
      report: stale.report,
    }));
}

// A push that names no phrase leaves every phrase that existed then possibly fired. A phrase added
// after that push, or one whose add time is unknown, is not covered by it.
function collectNeverFired(
  phrases: readonly string[],
  report: ItemUsageReport,
  addedTimes: ReadonlyMap<string, number> | undefined,
): readonly string[] {
  return phrases.filter((phrase) => {
    const key = buildTriggerKey(phrase);

    if (report.firedTriggers.includes(key)) {
      return false;
    }

    const addedAtMs = addedTimes?.get(key);

    return !(
      report.lastUnkeyedPushAtMs !== null &&
      (addedAtMs === undefined || addedAtMs <= report.lastUnkeyedPushAtMs)
    );
  });
}
