const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

export interface QuietHours {
  readonly start: string;
  readonly end: string;
}

// The return time of a defer: deferUntil, or the end of the quiet hours that deferUntil falls in.
// The end is a wall-clock time in the zone, so a clock change inside the quiet hours moves it.
export function pickReturnAt(
  deferUntil: number,
  quietHours: QuietHours | null,
  zone: string,
): number {
  if (quietHours === null) {
    return deferUntil;
  }

  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  const local = toWallClock(deferUntil, zone);
  const isWrapping = start > end;

  const isQuiet = isWrapping
    ? local.minutes >= start || local.minutes < end
    : local.minutes >= start && local.minutes < end;

  if (!isQuiet || start === end) {
    return deferUntil;
  }

  const isEndTomorrow = isWrapping && local.minutes >= start;
  const endDay = Date.UTC(local.year, local.month - 1, local.day) + (isEndTomorrow ? dayMs : 0);

  return toZonedInstant(endDay + end * minuteMs, zone);
}

function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');

  return Number(hours) * 60 + Number(minutes);
}

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly minutes: number;
}

function toWallClock(at: number, zone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));

  const pickPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: pickPart('year'),
    month: pickPart('month'),
    day: pickPart('day'),
    minutes: pickPart('hour') * 60 + pickPart('minute'),
  };
}

// The instant whose wall clock in the zone reads `wall` (a wall-clock time written as if it were
// UTC). A time the clock repeats takes its earlier instant, and a time the clock skips takes the
// instant the skip lands it on, as Temporal's 'compatible' disambiguation does.
function toZonedInstant(wall: number, zone: string): number {
  const offsetBefore = toOffsetMs(wall - dayMs, zone);
  const offsetAfter = toOffsetMs(wall + dayMs, zone);

  const matches = [wall - offsetBefore, wall - offsetAfter].filter(
    (instant) => toOffsetMs(instant, zone) === wall - instant,
  );

  return matches.length === 0 ? wall - offsetBefore : Math.min(...matches);
}

function toOffsetMs(at: number, zone: string): number {
  const whole = Math.floor(at / minuteMs) * minuteMs;
  const local = toWallClock(whole, zone);

  return Date.UTC(local.year, local.month - 1, local.day) + local.minutes * minuteMs - whole;
}
