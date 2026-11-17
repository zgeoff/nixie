export interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface ZoneParts extends LocalDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

// The clock of the zone at an instant, to the second.
export function buildZoneParts(instantMs: number, zone: string): ZoneParts {
  const values = new Map<string, number>();

  for (const part of getFormatter(zone).formatToParts(instantMs)) {
    values.set(part.type, Number(part.value));
  }

  return {
    year: values.get('year') ?? 0,
    month: values.get('month') ?? 0,
    day: values.get('day') ?? 0,
    hour: values.get('hour') ?? 0,
    minute: values.get('minute') ?? 0,
    second: values.get('second') ?? 0,
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone);

  if (cached !== undefined) {
    return cached;
  }

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });

  formatters.set(zone, created);

  return created;
}
