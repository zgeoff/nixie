import type { BackendHooks, DatabaseTestStore } from '@heynixie/connections/test-build';
import { createDatabaseTestStore } from '@heynixie/connections/test-build';
import type { TasksContext } from '@heynixie/tasks';

// A credential store over the database backend and the process's own log, so a process that starts
// on the same data directory finds what an earlier one saved. `ca` signs the fake provider's site.
export function createTestCredentialStore(
  context: TasksContext,
  ca: string,
  hooks?: BackendHooks,
): Promise<DatabaseTestStore> {
  return createDatabaseTestStore({
    log: context.log,
    ca,
    now: () => Date.now(),
    ...(hooks === undefined ? {} : { hooks }),
  });
}
