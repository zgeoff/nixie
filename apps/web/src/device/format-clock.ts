import type { RegionContent } from '@heynixie/contract';

type ClockFormat = Extract<RegionContent, { live: 'clock' }>['format'];

// The time in the formats a clock region takes, in the browser's own time zone unless the caller
// names one.
export function formatClock(nowMs: number, format: ClockFormat, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).formatToParts(nowMs);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  if (format === 'HH:mm') {
    return `${part('hour')}:${part('minute')}`;
  }

  if (format === 'HH:mm:ss') {
    return `${part('hour')}:${part('minute')}:${part('second')}`;
  }

  return `${part('weekday')} ${part('day')} ${part('month')}`;
}
