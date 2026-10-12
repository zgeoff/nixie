import type { StartedMemoryStore } from '@heynixie/memory';
import { findNoAllowRule, startMemoryStore } from '@heynixie/memory';
import { toErrorFields } from '@heynixie/ops';
import { startChecker } from './start-checker';
import type { ServerParts } from './types';

// Starts the checker, then the memory store after recovery, and returns the store, which resumes
// every pending forget and builds the index before any runner claims work. No live session reads
// memory yet, so a forget's session cleanup has nothing to clean.
export async function startMemory(parts: ServerParts): Promise<StartedMemoryStore> {
  const check = await startChecker({
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    image: parts.images.conversation.name,
    timeoutMs: parts.config.memory.checkerTimeoutMs,
  });
  const store = await startMemoryStore({
    log: parts.context.log,
    definitions: parts.context.definitions,
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check,
      clock: parts.context.clock,
      findAllowRule: findNoAllowRule,
      limits: parts.config.memory.limits,
    },
  });

  await parts.cleanup.defer(() => store.stop());

  // a proposal past its lapse time lapses on the next sweep, so none waits on a restart
  const sweep = setInterval(() => {
    void runLapseSweep(parts, store);
  }, lapseSweepMs);

  await parts.cleanup.defer(() => {
    clearInterval(sweep);
  });
  return store;
}

const lapseSweepMs = 60 * 60 * 1000;

async function runLapseSweep(parts: ServerParts, store: StartedMemoryStore): Promise<void> {
  try {
    await store.proposals.lapse();
  } catch (error) {
    parts.log('memory.lapse_failed', toErrorFields(error));
  }
}
