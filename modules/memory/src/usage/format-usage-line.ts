import { formatMemoryDay } from '@heynixie/sessions';
import type { ItemUsageReport } from './types';

export interface UsageLineOptions {
  readonly nowMs: number;
  readonly defaultZone: string;
}

// `surfaced 14 times (9 by search, 5 by push) since 3 Nov, last 3 days ago · recalled by ID 2
// weeks ago`, or `never surfaced`. The date shows only when the counts miss part of the item's
// life.
export function formatUsageLine(report: ItemUsageReport, options: UsageLineOptions): string {
  const since =
    report.sinceMs === null
      ? ''
      : ` since ${formatMemoryDay(report.sinceMs, {
          defaultZone: options.defaultZone,
          now: new Date(options.nowMs),
        })}`;

  const surfaced = report.searched + report.pushed;

  const head =
    surfaced === 0 || report.lastSurfacedAtMs === null
      ? `never surfaced${since}`
      : `surfaced ${formatTimes(surfaced)} (${formatHow(report)})${since}, last ${formatAgo(
          options.nowMs - report.lastSurfacedAtMs,
        )}`;

  return report.lastRecalledByIDAtMs === null
    ? head
    : `${head} · recalled by ID ${formatAgo(options.nowMs - report.lastRecalledByIDAtMs)}`;
}

function formatTimes(count: number): string {
  return count === 1 ? '1 time' : `${String(count)} times`;
}

function formatHow(report: ItemUsageReport): string {
  return [
    ...(report.searched === 0 ? [] : [`${String(report.searched)} by search`]),
    ...(report.pushed === 0 ? [] : [`${String(report.pushed)} by push`]),
  ].join(', ');
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

function formatAgo(elapsedMs: number): string {
  if (elapsedMs < minuteMs) {
    return 'just now';
  }

  const units: readonly (readonly [string, number])[] = [
    ['year', 365 * dayMs],
    ['month', 30 * dayMs],
    ['week', 7 * dayMs],
    ['day', dayMs],
    ['hour', hourMs],
    ['minute', minuteMs],
  ];

  const [name, size] = units.find(([, unitMs]) => elapsedMs >= unitMs) ?? ['minute', minuteMs];
  const count = Math.floor(elapsedMs / size);

  return `${String(count)} ${name}${count === 1 ? '' : 's'} ago`;
}
