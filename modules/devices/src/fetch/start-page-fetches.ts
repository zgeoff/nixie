import { startRecordWake, subscribeToCommits } from '@heynixie/log';
import { runFetchPass } from './run-fetch-pass';
import type { FetchSchedule, PageFetchesOptions } from './types';

// Runs the fetches that the pages of the online devices declare: each when its region shows, and
// again every `refreshMinutes`. A fetch stops when its region shows other content. It returns the
// function that stops the runner.
export function startPageFetches(options: PageFetchesOptions): () => void {
  const stopping = new AbortController();

  const nudge = { current: Promise.withResolvers<void>() };

  const unsubscribe = options.streams.subscribeToStatus(() => {
    nudge.current.resolve();
  });

  const wake = startRecordWake({
    subscribeToChanges: (onChange) => subscribeToCommits(options.log.writer, onChange),
    signal: stopping.signal,
  });

  void runLoop(options, { signal: stopping.signal, wake, nudge });

  return () => {
    stopping.abort();

    unsubscribe();

    wake.stop();
    nudge.current.resolve();
  };
}

interface LoopWaits {
  readonly signal: AbortSignal;
  readonly wake: ReturnType<typeof startRecordWake>;
  readonly nudge: { current: PromiseWithResolvers<void> };
}

async function runLoop(options: PageFetchesOptions, waits: LoopWaits): Promise<void> {
  const schedules = new Map<string, FetchSchedule>();

  while (!waits.signal.aborted) {
    waits.wake.reset();

    waits.nudge.current = Promise.withResolvers<void>();

    const delayMs = await runFetchPass(options, schedules);

    const sleeping = new AbortController();

    await Promise.race([
      waits.wake.wait(),
      waits.nudge.current.promise,
      options.clock.sleep(delayMs, sleeping.signal),
    ]);

    sleeping.abort();
  }
}
