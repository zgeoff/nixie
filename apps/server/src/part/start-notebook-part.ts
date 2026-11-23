import { toErrorFields } from '@heynixie/logger';
import type { CleanupSessions, StartedMemoryStore } from '@heynixie/memory';
import type { NotebookStore } from '@heynixie/notebook';
import { buildNotebookMemory, startNotebook } from '@heynixie/notebook';
import { readRunningStep } from '@heynixie/tasks';
import type { ServerParts } from '../types';

// Starts the notebook after memory: it reads item IDs and gists from memory, and its forget runs
// the session cleanup that memory's own forgets run.
export async function startNotebookPart(
  parts: ServerParts,
  memory: StartedMemoryStore,
  cleanupSessions: CleanupSessions,
): Promise<NotebookStore> {
  const store = await startNotebook({
    log: parts.context.log,
    definitions: parts.context.definitions,
    clock: parts.context.clock,
    settings: parts.config.notebook,
    memory: buildNotebookMemory(() => memory),
    cleanupSessions,
    readRunningStep: (thread) => readRunningStep(parts.context, thread),
    ...(parts.encoder === null
      ? {}
      : {
          semanticSearch: {
            encoder: parts.encoder,
            onError: (error: unknown) => {
              parts.log('notebook.encoding_failed', toErrorFields(error));
            },
          },
        }),
  });

  await parts.cleanup.defer(() => store.stop());

  void waitForSemanticIndex(parts, store);

  return store;
}

async function waitForSemanticIndex(parts: ServerParts, store: NotebookStore): Promise<void> {
  if (parts.encoder === null) {
    return;
  }

  const startedAt = performance.now();

  const isReady = await store.waitForSemanticIndex();

  const event = isReady ? 'notebook.semantic_index_ready' : 'notebook.semantic_index_failed';

  parts.log(event, { durationMs: Math.round(performance.now() - startedAt) });
}
