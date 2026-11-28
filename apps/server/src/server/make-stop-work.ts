import type { Cleanup } from '../types';

interface StopWorkOptions {
  readonly closeAPI: () => Promise<void>;
  readonly work: Pick<Cleanup, 'stop'>;
}

// Closes the API and stops every task, so nothing writes while a reset removes what it holds.
export function makeStopWork(options: StopWorkOptions): () => Promise<void> {
  return async () => {
    await options.closeAPI();
    await options.work.stop();
  };
}
