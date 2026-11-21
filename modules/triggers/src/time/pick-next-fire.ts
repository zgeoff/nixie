import type { LocalDate } from '@heynixie/clock';
import { buildLocalInstant, buildZoneOffsetMs, buildZoneParts } from '@heynixie/clock';
import type { Hours, Repeat, Trigger } from '@heynixie/contract';
import { pickNextWallTime } from '../recurrence/pick-next-wall-time';
import type { NormalizedSchedule } from '../recurrence/to-normalized-schedule';
import { toNormalizedSchedule } from '../recurrence/to-normalized-schedule';
import { addDays } from './add-days';
import { buildInstantKey } from './build-instant-key';
import { buildSlotKey } from './build-slot-key';
import { getWeekday } from './get-weekday';
import { toMinuteOfDay } from './to-minute-of-day';

export interface NextFire {
  readonly scheduledFor: number;

  // the end of the window of an old window schedule, else null
  readonly until: number | null;
  readonly dedupeKey: string;
}

// The first slot of the trigger strictly after the watermark, or null when none is left. Pure, over
// the runtime's zone data. The zone is an IANA zone: the caller has resolved 'owner'.
export function pickNextFire(
  definitionID: string,
  trigger: Trigger,
  afterMs: number,
  zone: string,
): NextFire | null {
  if ('at' in trigger) {
    const scheduledFor = Date.parse(trigger.at);

    return { scheduledFor, until: null, dedupeKey: buildInstantKey(definitionID, scheduledFor) };
  }

  return pickScheduleFire(definitionID, toNormalizedSchedule(trigger.schedule), afterMs, zone);
}

export function pickScheduleFire(
  definitionID: string,
  schedule: NormalizedSchedule,
  afterMs: number,
  zone: string,
): NextFire | null {
  const frequency = schedule.repeat.frequency;

  return frequency === 'minutely' || frequency === 'hourly'
    ? pickElapsedFire(definitionID, schedule, afterMs, zone)
    : pickCalendarFire(definitionID, schedule, afterMs, zone);
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

// A bound on the search, for a rule that the hours or the days rule out for good.
const maxSearchSteps = 10_000;

// A fire of a calendar frequency: a local date and time, which the zone maps onto its clock.
function pickCalendarFire(
  definitionID: string,
  schedule: NormalizedSchedule,
  afterMs: number,
  zone: string,
): NextFire | null {
  // start 2 days back, so that a wall time that the zone maps to a later instant still shows
  let cursor = afterMs + buildZoneOffsetMs(afterMs, zone) - 2 * dayMs;

  for (let step = 0; step < maxSearchSteps; step += 1) {
    const wall = pickNextWallTime(schedule.repeat, cursor);

    if (wall === null) {
      return null;
    }

    cursor = wall;

    const moved = new Date(wall);

    const date = {
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: moved.getUTCDate(),
    };

    const minute = moved.getUTCHours() * 60 + moved.getUTCMinutes();

    if (isWithinHours(schedule.hours, minute)) {
      const scheduledFor = buildLocalInstant(date, minute, zone);

      if (scheduledFor > afterMs) {
        return {
          scheduledFor,
          until: pickWindowEnd(schedule, date, minute, zone),
          dedupeKey: buildSlotKey(definitionID, date, formatClock(minute)),
        };
      }
    }
  }

  return null;
}

function formatClock(minute: number): string {
  const hour = String(Math.floor(minute / 60)).padStart(2, '0');

  return `${hour}:${String(minute % 60).padStart(2, '0')}`;
}

function pickWindowEnd(
  schedule: NormalizedSchedule,
  date: LocalDate,
  fromMinute: number,
  zone: string,
): number | null {
  if (schedule.hours === null || schedule.legacy?.isOncePerWindow !== true) {
    return null;
  }

  const untilMinute = toMinuteOfDay(schedule.hours.until);
  const nextDays = untilMinute <= fromMinute ? 1 : 0;

  return buildLocalInstant(addDays(date, nextDays), untilMinute, zone);
}

// Whether a minute of the day lies in the hours, both ends included. Hours with an end before their
// start run past midnight.
export function isWithinHours(hours: Hours | null, minute: number): boolean {
  if (hours === null) {
    return true;
  }

  const from = toMinuteOfDay(hours.from);
  const until = toMinuteOfDay(hours.until);

  return from <= until ? minute >= from && minute <= until : minute >= from || minute <= until;
}

// A fire of a minute or hour frequency: an instant, counted in elapsed time, so a change of the
// clock never moves it.
function pickElapsedFire(
  definitionID: string,
  schedule: NormalizedSchedule,
  afterMs: number,
  zone: string,
): NextFire | null {
  let cursor = afterMs;

  for (let step = 0; step < maxSearchSteps; step += 1) {
    const candidate = pickNextStep(schedule, cursor, zone);
    const parts = buildZoneParts(candidate, zone);

    if (isDayAllowed(schedule.repeat, parts)) {
      if (isWithinHours(schedule.hours, parts.hour * 60 + parts.minute)) {
        return {
          scheduledFor: candidate,
          until: null,
          dedupeKey: buildInstantKey(definitionID, candidate),
        };
      }

      cursor = pickHoursStart(schedule.hours, parts, zone) - 1;
    } else {
      cursor = buildLocalInstant(addDays(parts, 1), 0, zone) - 1;
    }
  }

  return null;
}

// The start of the hours that follows a minute outside them.
function pickHoursStart(
  hours: Hours | null,
  parts: LocalDate & { readonly hour: number; readonly minute: number },
  zone: string,
): number {
  const fromMinute = toMinuteOfDay(hours?.from ?? '00:00');
  const isBefore = parts.hour * 60 + parts.minute < fromMinute;
  const dayOffset = isBefore ? 0 : 1;

  return buildLocalInstant(addDays(parts, dayOffset), fromMinute, zone);
}

const epochDate: LocalDate = { year: 1970, month: 1, day: 1 };

function pickNextStep(schedule: NormalizedSchedule, afterMs: number, zone: string): number {
  const repeat = schedule.repeat;
  const interval = repeat.interval ?? 1;

  if (repeat.frequency === 'hourly' && interval === 1) {
    return pickNextHour(afterMs, zone);
  }

  const stepMs = (repeat.frequency === 'hourly' ? hourMs : minuteMs) * interval;
  const anchorMs = schedule.legacy?.isEpochAnchored === true ? 0 : buildAnchor(repeat, zone);
  const count = Math.max(0, Math.floor((afterMs - anchorMs) / stepMs) + 1);

  return anchorMs + count * stepMs;
}

function buildAnchor(repeat: Repeat, zone: string): number {
  const [year = 1970, month = 1, day = 1] = (repeat.starts ?? '1970-01-01').split('-').map(Number);
  const date = repeat.starts === undefined ? epochDate : { year, month, day };

  return buildLocalInstant(date, 0, zone);
}

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// The days filter of the repeat: a minute or hour schedule fires only on the days it names.
function isDayAllowed(repeat: Repeat, date: LocalDate): boolean {
  const weekday = weekdays[getWeekday(date)];

  const lastDay = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();

  const isWeekday =
    repeat.byDay === undefined ||
    repeat.byDay.some((entry) => (typeof entry === 'string' ? entry : entry.day) === weekday);

  const isMonthDay =
    repeat.byMonthDay === undefined ||
    repeat.byMonthDay.some((day) => (day > 0 ? day === date.day : lastDay + day + 1 === date.day));

  const isMonth = repeat.byMonth === undefined || repeat.byMonth.includes(date.month);

  return isWeekday && isMonthDay && isMonth;
}

const hourSearchMinutes = 180;

function pickNextHour(afterMs: number, zone: string): number {
  const first = pickNextMultiple(afterMs, minuteMs);
  const offset = buildZoneOffsetMs(first, zone);
  const localMinute = Math.floor((first + offset) / minuteMs) % 60;
  const jumped = first + ((60 - localMinute) % 60) * minuteMs;

  if (buildZoneOffsetMs(jumped, zone) === offset) {
    return jumped;
  }

  // the clock changed inside the hour, so look at each minute
  for (let step = 0; step < hourSearchMinutes; step += 1) {
    const candidate = first + step * minuteMs;

    if (isOnTheHour(candidate, zone)) {
      return candidate;
    }
  }

  return jumped;
}

function pickNextMultiple(afterMs: number, intervalMs: number): number {
  return (Math.floor(afterMs / intervalMs) + 1) * intervalMs;
}

function isOnTheHour(instantMs: number, zone: string): boolean {
  return Math.floor((instantMs + buildZoneOffsetMs(instantMs, zone)) / minuteMs) % 60 === 0;
}
