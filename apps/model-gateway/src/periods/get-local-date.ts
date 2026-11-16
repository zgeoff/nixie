// the ISO date that the instant falls on in the zone
export function getLocalDate(instantMs: number, zone: string): string {
  const parts = getFormatter(zone).formatToParts(instantMs);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';

  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone);

  if (cached !== undefined) {
    return cached;
  }

  const made = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  formatters.set(zone, made);

  return made;
}
