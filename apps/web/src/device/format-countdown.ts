// The time left until a moment, from days down to seconds, and `0` once it has passed. The count
// rounds up, so the screen shows 0:01 until the last second ends.
export function formatCountdown(toMs: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil((toMs - nowMs) / 1000));

  if (totalSeconds === 0) {
    return '0';
  }

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${String(days)}d ${String(hours)}h`;
  }

  if (hours > 0) {
    return `${String(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${String(minutes)}:${pad(seconds)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
