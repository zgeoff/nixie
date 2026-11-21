import type { Repeat } from '@heynixie/contract';
import { RRuleTemporal } from 'rrule-temporal';

// Takes and returns wall times: the milliseconds of a local date and time, as if the clock were
// UTC. The rule has no zone, because the library drops a time inside a spring-forward gap when it
// has one. Gives null when the rule never fires again, such as the 30th of February.
export function pickNextWallTime(repeat: Repeat, afterWallMs: number): number | null {
  const times = [...new Set(repeat.at ?? ['00:00'])];
  let first: number | null = null;

  for (const time of times) {
    const rule = new RRuleTemporal({ rruleString: buildRuleText(repeat, time) });

    const next = findNextWall(rule, afterWallMs);

    if (next !== null && (first === null || next < first)) {
      first = next;
    }
  }

  return first;
}

const frequencies = {
  minutely: 'MINUTELY',
  hourly: 'HOURLY',
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
} as const;

const epochDate = '1970-01-01';
const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function buildRuleText(repeat: Repeat, time: string): string {
  const starts = repeat.starts ?? epochDate;
  const [year = 1970, month = 1, day = 1] = starts.split('-').map(Number);

  const startsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const byDay = repeat.byDay ?? [];
  const hasDays = byDay.length > 0 || (repeat.byMonthDay ?? []).length > 0;

  const parts = [
    `FREQ=${frequencies[repeat.frequency]}`,
    `INTERVAL=${repeat.interval ?? 1}`,
    'WKST=MO',
  ];

  if (byDay.length > 0) {
    parts.push(`BYDAY=${byDay.map((entry) => formatDay(entry)).join(',')}`);
  } else if (repeat.frequency === 'weekly') {
    parts.push(`BYDAY=${weekdayCodes[startsWeekday]}`);
  }

  if (repeat.byMonthDay !== undefined) {
    parts.push(`BYMONTHDAY=${repeat.byMonthDay.join(',')}`);
  } else if (!hasDays && (repeat.frequency === 'monthly' || repeat.frequency === 'yearly')) {
    parts.push(`BYMONTHDAY=${day}`);
  }

  if (repeat.byMonth !== undefined) {
    parts.push(`BYMONTH=${repeat.byMonth.join(',')}`);
  } else if (!hasDays && repeat.frequency === 'yearly') {
    parts.push(`BYMONTH=${month}`);
  }

  const compactDate = starts.replaceAll('-', '');
  const compactTime = `${time.replace(':', '')}00`;

  return `DTSTART:${compactDate}T${compactTime}\nRRULE:${parts.join(';')}`;
}

const weekdayTokens = {
  mon: 'MO',
  tue: 'TU',
  wed: 'WE',
  thu: 'TH',
  fri: 'FR',
  sat: 'SA',
  sun: 'SU',
} as const;

function formatDay(entry: NonNullable<Repeat['byDay']>[number]): string {
  if (typeof entry === 'string') {
    return weekdayTokens[entry];
  }

  return `${entry.nth ?? ''}${weekdayTokens[entry.day]}`;
}

function findNextWall(rule: RRuleTemporal, afterWallMs: number): number | null {
  try {
    return rule.next(new Date(afterWallMs))?.epochMilliseconds ?? null;
  } catch {
    // the library throws once it has searched 10,000 candidates and found none, which is how it
    // reports a rule that never matches
    return null;
  }
}
