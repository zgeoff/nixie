import type { Log } from '@heynixie/log';
import { logProjections, startWriter } from '@heynixie/log';
import { memoryProjections } from '../memory-projections';
import { startMemoryStore } from '../start-memory-store';
import type { TestMemory, TestMemoryOptions } from './start-test-memory';

type StoreWiring = Pick<TestMemory, 'dataDir' | 'deploymentKey' | 'defer'>;

// Starts a writer on the data directory with the log's and the memory projections, and a store
// over it, and defers stopping both to the test's cleanup.
export async function startTestStore(
  wiring: StoreWiring,
  options: TestMemoryOptions,
): Promise<Pick<TestMemory, 'writer' | 'log' | 'store'>> {
  const writer = await startWriter({ dataDir: wiring.dataDir });

  wiring.defer(() => writer.stop());

  const log: Log = {
    writer,
    deploymentKey: wiring.deploymentKey,
    projections: [...logProjections, ...memoryProjections],
  };
  const store = await startMemoryStore({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: options.cleanupSessions ?? (() => Promise.resolve()),
  });

  wiring.defer(() => store.stop());
  return { writer, log, store };
}
