const firstDelayMs = 1000;
const longestDelayMs = 30_000;

export function pickReconnectDelay(failures: number): number {
  return Math.min(firstDelayMs * 2 ** Math.max(0, failures - 1), longestDelayMs);
}
