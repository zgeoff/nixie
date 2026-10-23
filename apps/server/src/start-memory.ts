import { toErrorFields } from '@heynixie/logger';
import type { CleanupSessions, StartedMemoryStore } from '@heynixie/memory';
import { findNoAllowRule, startLapseSweep, startMemoryStore } from '@heynixie/memory';
import type { RunCheck } from '@heynixie/sessions';
import type { ServerParts } from './types';

export async function startMemory(
  parts: ServerParts,
  cleanupSessions: CleanupSessions,
  check: RunCheck,
): Promise<StartedMemoryStore> {
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
      check,
      clock: parts.context.clock,
      defaultZone: parts.config.time.default_zone,
      findAllowRule: findNoAllowRule,
      limits: parts.config.memory.limits,
      ownerName: parts.config.owner.name,
      ownerPronouns: parts.config.owner.pronouns,
      getPrompts: () => parts.inForce.read()?.prompts ?? {},
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
