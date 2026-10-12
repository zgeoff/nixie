import type { StartedMemoryStore } from '@heynixie/memory';
import { startMemoryStore } from '@heynixie/memory';
import type { ServerParts } from './types';

// Starts the memory store after recovery, and returns it, which resumes every pending forget and builds the index
// before any runner claims work. No live session reads memory yet, so a forget's session cleanup
// has nothing to clean until memory reaches the conversation's context.
export async function startMemory(parts: ServerParts): Promise<StartedMemoryStore> {
  const store = await startMemoryStore({
    log: parts.context.log,
    definitions: parts.context.definitions,
    cleanupSessions: () => Promise.resolve(),
  });

  await parts.cleanup.defer(() => store.stop());
  return store;
}
