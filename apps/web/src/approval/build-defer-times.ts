export interface DeferSettings {
  readonly defaultMinutes: number;
  readonly eveningAt: string;
  readonly morningAt: string;
  readonly zone: string;
}

export interface DeferTimes {
  readonly inDefaultMinutes: Date;
  readonly thisEvening: Date;
  readonly tomorrowMorning: Date;
}

const minuteMs = 60_000;
const maxDeferMs = 30 * 24 * 60 * minuteMs;
const minDeferMs = minuteMs;

export function buildDeferTimes(now: Date, settings: DeferSettings): DeferTimes {
  const today = getZonedDay(now, settings.zone);
  const tomorrow = addDays(today, 1);
  const evening = buildZonedInstant(today, settings.eveningAt, settings.zone);
  const tomorrowEvening = buildZonedInstant(tomorrow, settings.eveningAt, settings.zone);

  return {
    inDefaultMinutes: new Date(now.getTime() + settings.defaultMinutes * minuteMs),
    thisEvening: evening.getTime() > now.getTime() ? evening : tomorrowEvening,
    tomorrowMorning: buildZonedInstant(tomorrow, settings.morningAt, settings.zone),
  };
}

// A custom defer lies 1 minute to 30 days ahead.
export function isDeferInRange(now: Date, until: Date): boolean {
  const ahead = until.getTime() - now.getTime();

  return ahead >= minDeferMs && ahead <= maxDeferMs;
}

interface Day {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function getZonedDay(instant: Date, zone: string): Day {
  const parts = collectZonedParts(instant.getTime(), zone);

  return { year: parts['year'] ?? 0, month: parts['month'] ?? 0, day: parts['day'] ?? 0 };
}

function collectZonedParts(instant: number, zone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    minute: 'numeric',
    month: 'numeric',
    second: 'numeric',
    timeZone: zone,
    year: 'numeric',
  }).formatToParts(new Date(instant));

  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function addDays(day: Day, days: number): Day {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + days));

  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

const dayMs = 24 * 60 * minuteMs;

// The instant at which the zone's clock reads the time on the day. A time that a clock change
// repeats reads as its first instant, and a time that it skips reads as that time moved on by the
// length of the gap.
function buildZonedInstant(day: Day, time: string, zone: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const wall = Date.UTC(day.year, day.month - 1, day.day, hours, minutes);
  const before = getZoneOffset(wall - dayMs, zone);
  const after = getZoneOffset(wall + dayMs, zone);

  const candidates = [before, after]
    .map((offset) => ({ offset, instant: wall - offset }))
    .filter((candidate) => getZoneOffset(candidate.instant, zone) === candidate.offset)
    .map((candidate) => candidate.instant);

  const earliest = candidates.length === 0 ? wall - before : Math.min(...candidates);

  return new Date(earliest);
}

// The zone's offset from UTC at an instant, in milliseconds.
function getZoneOffset(instant: number, zone: string): number {
  const parts = collectZonedParts(instant, zone);

  const asUTC = Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
    parts['second'] ?? 0,
  );

  return asUTC - Math.floor(instant / 1000) * 1000;
}
