import type { FakeClock } from '@zgeoff/testing/clock';

interface GraceStoppable {
  readonly stop: (graceMs: number) => Promise<void>;
}

const ADVANCE_INTERVAL_MS = 5;

// A stop with no grace sleeps for 0 ms on the clock. The system clock ends that sleep at once, and a
// test clock holds it until the test moves the clock, so the clock moves by nothing until the stop
// ends.
export async function stopWithoutGrace(clock: FakeClock, target: GraceStoppable): Promise<void> {
  const stopping = target.stop(0);

  const timer = setInterval(() => {
    clock.advance(0);
  }, ADVANCE_INTERVAL_MS);

  try {
    await stopping;
  } finally {
    clearInterval(timer);
  }
}
