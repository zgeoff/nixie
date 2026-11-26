// The length of a call as minutes and seconds, such as 3:05, and hours when it passes one.
export function formatCallTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${String(totalMinutes)}:${seconds}`;
  }

  const minutes = String(totalMinutes % 60).padStart(2, '0');

  return `${String(Math.floor(totalMinutes / 60))}:${minutes}:${seconds}`;
}
