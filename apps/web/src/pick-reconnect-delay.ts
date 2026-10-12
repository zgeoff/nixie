// The shortest wait before the live stream follows again, and the longest it backs off to.
const firstDelayMs = 1000;
const longestDelayMs = 30_000;

// How long the client waits before it follows the log again, from the failed attempts in a row
// since the last connection. A stream that dropped after it connected waits the shortest time, and
// each failure after that doubles the wait up to the longest.
export function pickReconnectDelay(failures: number): number {
  return Math.min(firstDelayMs * 2 ** Math.max(0, failures - 1), longestDelayMs);
}
