// The idle time as the assistant reads it: whole minutes, or seconds below a minute.
export function formatIdleTime(idleMs: number): string {
  const minutes = Math.round(idleMs / 60_000);

  if (idleMs < 60_000) {
    const seconds = Math.max(1, Math.round(idleMs / 1000));

    return seconds === 1 ? '1 second' : `${String(seconds)} seconds`;
  }

  return minutes === 1 ? '1 minute' : `${String(minutes)} minutes`;
}
