import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';

export interface LostLatch {
  // writes the lost mark; the latch refuses from the call until the mark is in the store
  readonly loseCount: () => Promise<void>;
  readonly isHeld: () => boolean;
}

// The process refuses while any mark is still being written, and for good once a write fails,
// because the store then holds no mark. A mark that reached the store refuses through the store
// alone, so an operator who deletes it restores service with no restart.
export function makeLostLatch(markLost: () => Promise<void>, log: Logger): LostLatch {
  let pendingMarks = 0;
  let hasMarkFailed = false;

  const loseCount = async (): Promise<void> => {
    pendingMarks += 1;

    try {
      await markLost();
    } catch (error) {
      hasMarkFailed = true;

      log('counter.mark_failed', toErrorFields(error), 'error');
    } finally {
      pendingMarks -= 1;
    }
  };

  return { loseCount, isHeld: () => hasMarkFailed || pendingMarks > 0 };
}
