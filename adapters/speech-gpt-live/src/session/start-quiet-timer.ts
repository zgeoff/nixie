import type { Clock } from '@heynixie/clock';

export interface QuietTimerSlot {
  current: AbortController | null;
}

// Runs `onQuiet` once `quietMs` pass with no further call for the same slot. A later call replaces
// the timer that is waiting.
export function startQuietTimer(
  clock: Clock,
  slot: QuietTimerSlot,
  quietMs: number,
  onQuiet: () => void,
): void {
  slot.current?.abort();

  const timer = new AbortController();

  slot.current = timer;
  void waitQuiet(clock, { slot, timer, quietMs, onQuiet });
}

interface QuietWait {
  readonly slot: QuietTimerSlot;
  readonly timer: AbortController;
  readonly quietMs: number;
  readonly onQuiet: () => void;
}

async function waitQuiet(clock: Clock, wait: QuietWait): Promise<void> {
  await clock.sleep(wait.quietMs, wait.timer.signal);

  if (!wait.timer.signal.aborted) {
    wait.slot.current = null;

    wait.onQuiet();
  }
}
