// A clock that jumps to the time a sleep waits for as the sleep ends, so a real-time loop runs at
// once while every reading matches the schedule the loop keeps. Work that settles before the sleep
// ends reads the time from before it, as on a real clock.
export function buildStepClock(): { now: () => number; sleepUntil: (ms: number) => Promise<void> } {
  let current = 0;
  return {
    now: () => current,
    sleepUntil: async (ms) => {
      await Promise.resolve();
      current = Math.max(current, ms);
    },
  };
}
