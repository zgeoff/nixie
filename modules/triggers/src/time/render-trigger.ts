import { buildZoneParts } from '@heynixie/clock';
import type { Schedule, Trigger } from '@heynixie/contract';
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

const longWeekdays = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
} as const;

function renderWords(trigger: Trigger, zone: string): string {
  if ('at' in trigger) {
    const instantMs = Date.parse(trigger.at);

    return `once on ${formatDate(instantMs, zone)} at ${formatTime(instantMs, zone)}`;
  }

  if (trigger.schedule.every === 'hour') {
    return 'every hour';
  }

  if (typeof trigger.schedule.every === 'object') {
    return `every ${trigger.schedule.every.minutes} minutes`;
  }

  const days =
    trigger.schedule.every === 'week'
      ? `every ${longWeekdays[trigger.schedule.on ?? 'mon']}`
      : 'every day';

  return `${days} ${renderTimes(trigger.schedule)}`;
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

function renderTimes(schedule: Schedule): string {
  if (schedule.window === undefined) {
    return `at ${schedule.at ?? '00:00'}`;
  }

  const between = `between ${schedule.window.from} and ${schedule.window.until}`;

  return schedule.idleMinutes === undefined
    ? between
    : `${between}, once idle for ${schedule.idleMinutes} minutes`;
}

function renderNext(trigger: Trigger, scheduledFor: number, zone: string): string {
  const date = formatDate(scheduledFor, zone);

  const isInstantSchedule =
    'schedule' in trigger &&
    (trigger.schedule.every === 'hour' || typeof trigger.schedule.every === 'object');

  return isInstantSchedule ? `${date} at ${formatTime(scheduledFor, zone)}` : date;
}
