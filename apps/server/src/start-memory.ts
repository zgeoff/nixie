import { toErrorFields } from '@heynixie/logger';
import type { CleanupSessions, StartedMemoryStore } from '@heynixie/memory';
import { findNoAllowRule, startLapseSweep, startMemoryStore } from '@heynixie/memory';
import { startChecker } from './start-checker';
import type { ServerParts } from './types';

// Starts the checker, then the memory store after recovery and after the conversation imp, which
// supplies the session cleanup a forget runs. The store resumes every pending forget, cleanup
// included, and builds the keyword index before any runner claims work.
export async function startMemory(
  parts: ServerParts,
  cleanupSessions: CleanupSessions,
): Promise<StartedMemoryStore> {
  const checker = await startChecker({
    models: parts.config.models,
    secrets: parts.modelSecrets,
    sandboxes: parts.tools.adapter,
    image: parts.images.conversation.name,
    timeoutMs: parts.config.memory.checkerTimeoutMs,
    clock: parts.context.clock,
    log: parts.log,
  });

  await parts.cleanup.defer(() => checker.stop());

  const store = await startMemoryStore({
    log: parts.context.log,
    definitions: parts.context.definitions,
    cleanupSessions,
    pinnedCoreTokens: parts.config.memory.pinnedCoreTokens,
    ...(parts.encoder === null
      ? {}
      : {
          semanticSearch: {
            encoder: parts.encoder,
            onError: (error: unknown) => {
              parts.log('memory.encoding_failed', toErrorFields(error));
            },
          },
        }),
    gate: {
      check: checker.check,
      clock: parts.context.clock,
      findAllowRule: findNoAllowRule,
      limits: parts.config.memory.limits,
      ownerName: parts.config.owner.name,
      ownerPronouns: parts.config.owner.pronouns,
    },
  });

  await parts.cleanup.defer(() => store.stop());

  void waitForSemanticIndex(parts, store);

  const sweep = startLapseSweep({
    store,
    onError: (error) => {
      parts.log('memory.lapse_failed', toErrorFields(error));
    },
  });

  await parts.cleanup.defer(() => sweep.stop());

  return store;
}

// The vector index rebuilds after the store starts, and search reads keywords until it ends, so the
// log shows when meaning joins the search and how long the rebuild took.
async function waitForSemanticIndex(parts: ServerParts, store: StartedMemoryStore): Promise<void> {
  if (parts.encoder === null) {
    return;
  }

  const startedAt = performance.now();

  const isReady = await store.waitForSemanticIndex();

  const event = isReady ? 'memory.semantic_index_ready' : 'memory.semantic_index_failed';

  parts.log(event, {
    durationMs: Math.round(performance.now() - startedAt),
  });
}
