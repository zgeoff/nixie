import type { TasksContext } from '@heynixie/tasks';
import { createTestCredentialStore } from './create-test-credential-store';

// The start of a test build: a refresh that wrote `credential.refresh_started` and no result marks
// its credential `needs_consent`, as every start of a store with a held backend does.
export async function recoverTestCredentials(context: TasksContext): Promise<void> {
  const held = await createTestCredentialStore(context, '');

  await held.store.recover();
}
