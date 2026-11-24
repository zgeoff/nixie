export function formatIdleTime(idleMs: number): string {
  if (idleMs >= 60_000 && idleMs % 60_000 === 0) {
    const minutes = idleMs / 60_000;

    return minutes === 1 ? '1 minute' : `${String(minutes)} minutes`;
  }

  const seconds = Math.max(1, Math.floor(idleMs / 1000));

  return seconds === 1 ? '1 second' : `${String(seconds)} seconds`;
}
