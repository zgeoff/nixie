// Formats how long something has waited as a whole number of the largest unit that fits, such as
// 3 days, or under a minute.
export function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);

  if (minutes < 1) {
    return 'under a minute';
  }

  if (minutes < 60) {
    return formatCount(minutes, 'minute');
  }

  const hours = Math.floor(minutes / 60);

  return hours < 24 ? formatCount(hours, 'hour') : formatCount(Math.floor(hours / 24), 'day');
}

function formatCount(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}
