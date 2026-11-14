import type { Log } from '@heynixie/log';
import type { TestClock } from '@heynixie/testing';
import type { StartedMemoryStore } from '../memory/start-memory-store';

export interface MemorySeederDeps {
  readonly store: StartedMemoryStore;
  readonly log: Pick<Log, 'writer'>;
  readonly clock: Pick<TestClock, 'advance'>;
}
