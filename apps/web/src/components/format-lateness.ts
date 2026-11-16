// How late a reminder arrived, as a person reads it: "45 minutes", "1 hour", "2 hours 5 minutes".
export function formatLateness(lateBySeconds: number): string {
  const totalMinutes = Math.max(1, Math.round(lateBySeconds / 60));

  if (totalMinutes < 60) {
    return formatUnit(totalMinutes, 'minute');
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0
    ? formatUnit(hours, 'hour')
    : `${formatUnit(hours, 'hour')} ${formatUnit(minutes, 'minute')}`;
}

function formatUnit(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}
