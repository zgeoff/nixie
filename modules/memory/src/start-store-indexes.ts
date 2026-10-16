import type { MemoryIndex } from './start-memory-index';
import { startMemoryIndex } from './start-memory-index';
import type { VectorIndex } from './start-vector-index';
import { startVectorIndex } from './start-vector-index';
import type { MemoryContext } from './types';

export interface StoreIndexes {
  readonly index: MemoryIndex;

  // null when the context names no encoder
  readonly vectors: VectorIndex | null;
}

// Starts the keyword index, and the vector index when the context names an encoder, both empty.
export async function startStoreIndexes(context: MemoryContext): Promise<StoreIndexes> {
  const index = await startMemoryIndex();

  const semantic = context.semanticSearch;

  return {
    index,
    vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
  };
}
