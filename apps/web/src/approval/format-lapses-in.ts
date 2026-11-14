const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

// "Lapses in 3 days" for a proposal that lapses at the given time.
export function formatLapsesIn(lapsesAt: Date, now: Date): string {
  const aheadMs = lapsesAt.getTime() - now.getTime();

  if (aheadMs < minuteMs) {
    return 'Lapses in less than a minute';
  }

  if (aheadMs < hourMs) {
    return `Lapses in ${countUnit(Math.floor(aheadMs / minuteMs), 'minute')}`;
  }

  if (aheadMs < 2 * dayMs) {
    return `Lapses in ${countUnit(Math.floor(aheadMs / hourMs), 'hour')}`;
  }

  return `Lapses in ${countUnit(Math.floor(aheadMs / dayMs), 'day')}`;
}

function countUnit(count: number, unit: string): string {
  return count === 1 ? `1 ${unit}` : `${String(count)} ${unit}s`;
}
