import type { Log } from '@heynixie/log';
import type { FakeClock } from '@zgeoff/testing/clock';
import type { StartedMemoryStore } from '../memory/start-memory-store';

export interface MemorySeederDeps {
  readonly store: StartedMemoryStore;
  readonly log: Log;
  readonly clock: Pick<FakeClock, 'advance'>;
}
