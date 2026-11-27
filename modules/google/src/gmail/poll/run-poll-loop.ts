import { toErrorFields } from '@heynixie/logger';
import { runPollCycle } from './run-poll-cycle';
import type { PollRun } from './types';

export async function runPollLoop(run: PollRun): Promise<void> {
  while (!run.signal.aborted) {
    let waitMs = run.input.pollIntervalMs;

    try {
      waitMs = await runPollCycle(run);
    } catch (error) {
      if (!run.signal.aborted) {
        run.input.logEvent('gmail.source_failed', toErrorFields(error));
      }
    }

    if (!run.signal.aborted) {
      await run.input.clock.sleep(waitMs, run.signal).catch(() => {});
    }
  }
}
