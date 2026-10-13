import type { MemoryToolStore } from '@heynixie/memory';
import { buildMemoryTools } from '@heynixie/memory';
import type { ToolDefinition } from '@heynixie/tools';

// Builds the conversation's tool definitions: the web fetch tool and the 3 memory tools. The
// registry exists before the memory store starts, so the memory tools reach the store through
// readStore, which returns null until it starts. A call before that throws.
export function buildConversationTools(
  webFetch: ToolDefinition,
  readStore: () => MemoryToolStore | null,
): readonly ToolDefinition[] {
  const requireStore = (): MemoryToolStore => {
    const store = readStore();

    if (store === null) {
      throw new Error('a tool call ran before the memory store started');
    }
    return store;
  };

  return [
    webFetch,
    ...buildMemoryTools({
      recall: (request) => requireStore().recall(request),
      writes: {
        remember: (request) => requireStore().writes.remember(request),
        retire: (request) => requireStore().writes.retire(request),
      },
    }),
  ];
}
