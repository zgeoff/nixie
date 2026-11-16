import type { Schedule, Trigger } from '@heynixie/contract';
import { addDays } from './add-days';
import { buildInstantKey } from './build-instant-key';
import { buildLocalInstant } from './build-local-instant';
import { buildSlotKey } from './build-slot-key';
import { buildZoneOffsetMs } from './build-zone-offset-ms';
import type { LocalDate } from './build-zone-parts';
import { buildZoneParts } from './build-zone-parts';
import { getWeekday } from './get-weekday';
import { toMinuteOfDay } from './to-minute-of-day';

export interface NextFire {
  readonly scheduledFor: number;

  // the end of the window for a `window` schedule, else null
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

  if (trigger.schedule.every === 'day' || trigger.schedule.every === 'week') {
    return pickCalendarFire(definitionID, trigger.schedule, afterMs, zone);
  }

  const scheduledFor = pickInstantFire(trigger.schedule.every, afterMs, zone);

  return { scheduledFor, until: null, dedupeKey: buildInstantKey(definitionID, scheduledFor) };
}

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const calendarSearchDays = 14;

function pickCalendarFire(
  definitionID: string,
  schedule: Schedule,
  afterMs: number,
  zone: string,
): NextFire | null {
  const clockTime = schedule.window?.from ?? schedule.at ?? '00:00';
  const fromMinute = toMinuteOfDay(clockTime);
  const start = buildZoneParts(afterMs, zone);

  for (let offset = -1; offset < calendarSearchDays; offset += 1) {
    const date = addDays(start, offset);
    const isDay = schedule.every === 'day' || weekdays[getWeekday(date)] === schedule.on;
    const scheduledFor = isDay ? buildLocalInstant(date, fromMinute, zone) : afterMs;

    if (isDay && scheduledFor > afterMs) {
      return {
        scheduledFor,
        until: pickWindowEnd(schedule.window, date, fromMinute, zone),
        dedupeKey: buildSlotKey(definitionID, date, clockTime),
      };
    }
  }

  return null;
}

function pickWindowEnd(
  window: Schedule['window'],
  date: LocalDate,
  fromMinute: number,
  zone: string,
): number | null {
  if (window === undefined) {
    return null;
  }

  const untilMinute = toMinuteOfDay(window.until);
  const nextDays = untilMinute <= fromMinute ? 1 : 0;
  const untilDate = addDays(date, nextDays);

  return buildLocalInstant(untilDate, untilMinute, zone);
}

const minuteMs = 60_000;

// The fire of an `hour` or a minutes schedule, which both fire on instants.
function pickInstantFire(every: Schedule['every'], afterMs: number, zone: string): number {
  if (every === 'hour') {
    return pickNextHour(afterMs, zone);
  }

  const intervalMs = typeof every === 'object' ? every.minutes * minuteMs : minuteMs;

  return pickNextMultiple(afterMs, intervalMs);
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
