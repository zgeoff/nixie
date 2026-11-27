import type { ErasureRegistry } from '@heynixie/log';
import { toErrorFields } from '@heynixie/logger';
import type { StartedMemoryStore } from '@heynixie/memory';
import { startLapseSweep, startMemoryStore } from '@heynixie/memory';
import { buildItemLinkCounts } from '@heynixie/notebook';
import type { RunCheck } from '@heynixie/sessions';
import type { ServerParts } from '../types';

const dayMs = 24 * 60 * 60 * 1000;

export async function startMemory(
  parts: ServerParts,
  check: RunCheck,
  erasure: ErasureRegistry,
): Promise<StartedMemoryStore> {
  const store = await startMemoryStore({
    log: parts.context.log,
    definitions: parts.context.definitions,
    erasure,
    linkCounts: buildItemLinkCounts(parts.context.log),
    pinnedCoreTokens: parts.config.memory.pinnedCoreTokens,
    index: parts.config.memory.index,
    turn: parts.config.memory.turn,
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
      limits: {
        ...parts.config.memory.limits,
        proposalLapseMs: parts.config.approvals.lapse_days.memory * dayMs,
      },
      ownerName: parts.config.owner.name,
      ownerPronouns: parts.config.owner.pronouns,
      getPromptsInForce: () => {
        const inForce = parts.inForce.read();

        return { snapshotHash: inForce?.snapshotHash ?? '', prompts: inForce?.prompts ?? {} };
      },
    },
  });

  await parts.cleanup.defer(() => store.stop());

  // A purge that no record forget owns has no later step to finish it
  await store.finishEvidencePurges({ isUnowned: true });

  void waitForSemanticIndex(parts, store);

  const sweep = startLapseSweep({
    store,
    clock: parts.context.clock,
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
