import { join } from 'node:path';
import type { HeldTestStore } from '@heynixie/credentials/test-build';
import { createHeldTestStore } from '@heynixie/credentials/test-build';
import type { TasksContext } from '@heynixie/tasks';

// A credential store that keeps its backend in a file of the data directory, so a process that
// starts on the same directory holds what an earlier one saved. `ca` signs the fake provider's site.
export function createTestCredentialStore(
  context: TasksContext,
  ca: string,
): Promise<HeldTestStore> {
  return createHeldTestStore({
    log: context.log,
    ca,
    now: () => Date.now(),
    backendFile: join(context.log.writer.dataDir, 'test-credentials.json'),
  });
}
