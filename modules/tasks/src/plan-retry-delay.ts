// The wait before the conversation's next step after its nth step error in a row: the retry delay,
// doubling with each error up to the maximum, so a long outage costs one try per maximum delay.
export function planRetryDelay(errors: number, firstMs: number, maxMs: number): number {
  return Math.min(firstMs * 2 ** Math.max(errors - 1, 0), maxMs);
}
