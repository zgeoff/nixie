const eventsPerMinute = 30;
const eventIntervalMs = 1000;

// Whether a region may send another event now, given the times of the ones it sent in the last
// minute: 1 a second and 30 a minute. The device drops the rest.
export function canSendEvent(sentAtMs: readonly number[], nowMs: number): boolean {
  const recent = sentAtMs.filter((atMs) => nowMs - atMs < 60_000);
  const last = recent.at(-1);

  return recent.length < eventsPerMinute && (last === undefined || nowMs - last >= eventIntervalMs);
}
