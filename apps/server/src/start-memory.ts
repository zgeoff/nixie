import type { CleanupSessions, StartedMemoryStore } from '@heynixie/memory';
import { findNoAllowRule, startMemoryStore } from '@heynixie/memory';
import { toErrorFields } from '@heynixie/ops';
import { startChecker } from './start-checker';
import type { ServerParts } from './types';

// Starts the checker, then the memory store after recovery and after the conversation imp, which
// supplies the session cleanup a forget runs. The store resumes every pending forget, cleanup
// included, and builds the index before any runner claims work.
export async function startMemory(
  parts: ServerParts,
  cleanupSessions: CleanupSessions,
): Promise<StartedMemoryStore> {
  const check = await startChecker({
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    image: parts.images.conversation.name,
    timeoutMs: parts.config.memory.checkerTimeoutMs,
    log: parts.log,
  });
  const store = await startMemoryStore({
    log: parts.context.log,
    definitions: parts.context.definitions,
    cleanupSessions,
    pinnedCoreTokens: parts.config.memory.pinnedCoreTokens,
    gate: {
      check,
      clock: parts.context.clock,
      findAllowRule: findNoAllowRule,
      limits: parts.config.memory.limits,
    },
  });

  await parts.cleanup.defer(() => store.stop());

  // a proposal or a consolidation change past its lapse time lapses on the next sweep, so none waits
  // on a restart
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
    await store.consolidations.lapse();
  } catch (error) {
    parts.log('memory.lapse_failed', toErrorFields(error));
  }
}
