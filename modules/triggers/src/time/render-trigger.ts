import { buildZoneParts } from '@heynixie/clock';
import type { Repeat, Trigger } from '@heynixie/contract';
import type { NormalizedSchedule } from '../recurrence/to-normalized-schedule';
import { toNormalizedSchedule } from '../recurrence/to-normalized-schedule';
import { getWeekday } from './get-weekday';
import { pickNextFire } from './pick-next-fire';

export interface RenderedTrigger {
  readonly rendered: string;

  // the date of the next fire in the zone, such as 'Fri 12 Mar', or null when none is left
  readonly next: string | null;
}

// Pure, beside pickNextFire. The words of a trigger and the date of its next fire in the zone.
export function renderTrigger(trigger: Trigger, afterMs: number, zone: string): RenderedTrigger {
  const fire = pickNextFire('', trigger, afterMs, zone);

  return {
    rendered: renderWords(trigger, zone),
    next: fire === null ? null : renderNext(trigger, fire.scheduledFor, zone),
  };
}

function renderWords(trigger: Trigger, zone: string): string {
  if ('at' in trigger) {
    const instantMs = Date.parse(trigger.at);

    return `once on ${formatDate(instantMs, zone)} at ${formatTime(instantMs, zone)}`;
  }

  const schedule = toNormalizedSchedule(trigger.schedule);

  const parts = [
    renderCadence(schedule.repeat),
    renderTimes(schedule),
    renderHours(schedule),
    renderStart(schedule.repeat),
  ];

  return `${parts.filter((part) => part !== '').join(' ')} (${zone})`;
}

const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatDate(instantMs: number, zone: string): string {
  const parts = buildZoneParts(instantMs, zone);
  const weekday = shortWeekdays[getWeekday(parts)] ?? '';

  return `${weekday} ${parts.day} ${shortMonths[parts.month - 1] ?? ''}`;
}

function formatTime(instantMs: number, zone: string): string {
  const parts = buildZoneParts(instantMs, zone);

  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

const frequencyUnits = {
  minutely: 'minute',
  hourly: 'hour',
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
} as const;

function renderCadence(repeat: Repeat): string {
  const interval = repeat.interval ?? 1;
  const unit = frequencyUnits[repeat.frequency];
  const days = (repeat.byDay ?? []).map((entry) => renderDay(entry));
  const isWeekdays = isWeekdaySet(repeat);

  if (repeat.frequency === 'weekly') {
    if (days.length === 0) {
      return interval === 1 ? 'every week' : `every ${interval} weeks`;
    }

    return interval === 1
      ? `every ${joinWords(days)}`
      : `every ${interval} weeks, on ${joinWords(days)}`;
  }

  const every = interval === 1 ? `every ${unit}` : `every ${interval} ${unit}s`;

  if (isWeekdays) {
    return interval === 1 ? `every weekday` : `${every}, on weekdays`;
  }

  return [every, renderDays(repeat, days), renderMonths(repeat)]
    .filter((part) => part !== '')
    .join(', ');
}

const longWeekdays = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
} as const;

function renderDay(entry: NonNullable<Repeat['byDay']>[number]): string {
  if (typeof entry === 'string') {
    return longWeekdays[entry];
  }

  const day = longWeekdays[entry.day];

  return entry.nth === undefined ? day : `the ${renderOrdinal(entry.nth)} ${day}`;
}

function renderOrdinal(nth: number): string {
  const names = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

  if (nth === -1) {
    return 'last';
  }

  return nth < 0 ? `${names[-nth - 1] ?? ''} to last` : (names[nth - 1] ?? '');
}

function isWeekdaySet(repeat: Repeat): boolean {
  const days: readonly string[] = (repeat.byDay ?? []).flatMap((entry) =>
    typeof entry === 'string' ? [entry] : [],
  );

  return (
    repeat.frequency === 'daily' &&
    days.length === 5 &&
    ['mon', 'tue', 'wed', 'thu', 'fri'].every((day) => days.includes(day))
  );
}

function joinWords(words: readonly string[]): string {
  const last = words.at(-1);

  return words.length < 2 ? (last ?? '') : `${words.slice(0, -1).join(', ')} and ${last}`;
}

function renderDays(repeat: Repeat, days: readonly string[]): string {
  const monthDays = (repeat.byMonthDay ?? []).map((day) => renderMonthDay(day));
  const all = [...days, ...monthDays];

  return all.length === 0 ? '' : `on ${joinWords(all)}`;
}

function renderMonthDay(day: number): string {
  if (day === -1) {
    return 'the last day';
  }

  return day < 0 ? `day ${day} from the end` : `day ${day}`;
}

const longMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function renderMonths(repeat: Repeat): string {
  const months = (repeat.byMonth ?? []).map((month) => longMonths[month - 1] ?? '');

  return months.length === 0 ? '' : `in ${joinWords(months)}`;
}

function renderTimes(schedule: NormalizedSchedule): string {
  const repeat = schedule.repeat;

  if (repeat.frequency === 'minutely' || repeat.frequency === 'hourly') {
    return '';
  }

  // the start of an old window is no time of its own: its hours say it
  if (schedule.legacy?.isOncePerWindow === true) {
    return '';
  }

  return `at ${joinWords(repeat.at ?? ['00:00'])}`;
}

function renderHours(schedule: NormalizedSchedule): string {
  if (schedule.hours === null) {
    return '';
  }

  const between = `between ${schedule.hours.from} and ${schedule.hours.until}`;
  const idle = schedule.legacy?.idleMinutes ?? null;

  return idle === null ? between : `${between}, once idle for ${idle} minutes`;
}

function renderStart(repeat: Repeat): string {
  if ((repeat.interval ?? 1) === 1 || repeat.starts === undefined) {
    return '';
  }

  const [year = 0, month = 1, day = 1] = repeat.starts.split('-').map(Number);
  const date = { year, month, day };

  return `from ${shortWeekdays[getWeekday(date)] ?? ''} ${day} ${shortMonths[month - 1] ?? ''} ${year}`;
}

function renderNext(trigger: Trigger, scheduledFor: number, zone: string): string {
  const date = formatDate(scheduledFor, zone);

  return isDateOnly(trigger) ? date : `${date} at ${formatTime(scheduledFor, zone)}`;
}

// A calendar schedule with one time a day reads as a date, because the time is in its words.
function isDateOnly(trigger: Trigger): boolean {
  if ('at' in trigger) {
    return true;
  }

  const repeat = toNormalizedSchedule(trigger.schedule).repeat;

  return (
    repeat.frequency !== 'minutely' &&
    repeat.frequency !== 'hourly' &&
    (repeat.at ?? []).length <= 1
  );
}
