const secondMs = 1000;
const minuteMs = 60 * secondMs;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

// A gap in at most two units, largest first, rounded down: `40 s`, `12 min`, `3 h 12 min`,
// `2 days 4 h`. A negative gap, from a clock that stepped back, shows as no time.
export function formatGap(gapMs: number): string {
  const clampedMs = Math.max(0, gapMs);

  if (clampedMs < minuteMs) {
    return `${Math.floor(clampedMs / secondMs)} s`;
  }

  if (clampedMs < hourMs) {
    return `${Math.floor(clampedMs / minuteMs)} min`;
  }

  if (clampedMs < dayMs) {
    return joinUnits(
      `${Math.floor(clampedMs / hourMs)} h`,
      Math.floor((clampedMs % hourMs) / minuteMs),
      'min',
    );
  }

  const days = Math.floor(clampedMs / dayMs);

  return joinUnits(
    `${days} ${days === 1 ? 'day' : 'days'}`,
    Math.floor((clampedMs % dayMs) / hourMs),
    'h',
  );
}

function joinUnits(larger: string, smaller: number, unit: string): string {
  return smaller === 0 ? larger : `${larger} ${smaller} ${unit}`;
}
