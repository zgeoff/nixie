import type { DeliveryLock } from './make-delivery-lock';
import { makeDeliveryLock } from './make-delivery-lock';
import type { MessageCursor } from './make-message-cursor';
import { makeMessageCursor } from './make-message-cursor';
import type { MemoryIndex } from './start-memory-index';
import { startMemoryIndex } from './start-memory-index';
import type { VectorIndex } from './start-vector-index';
import { startVectorIndex } from './start-vector-index';
import type { MemoryContext } from './types';

// The indexes of your past messages, each entry keyed by its record's sequence, apart from the
// items' indexes so a recall of items never ranks a message.
interface MessageIndexes {
  readonly index: MemoryIndex;

  // null when the context names no encoder
  readonly vectors: VectorIndex | null;
  readonly cursor: MessageCursor;

  // runs one catch-up at a time, so two never read the same records
  readonly lock: DeliveryLock;
}

export interface StoreIndexes {
  readonly index: MemoryIndex;

  // null when the context names no encoder
  readonly vectors: VectorIndex | null;
  readonly messages: MessageIndexes;
}

// Starts the keyword indexes, and the vector indexes when the context names an encoder, all empty.
export async function startStoreIndexes(context: MemoryContext): Promise<StoreIndexes> {
  const index = await startMemoryIndex();
  const messageIndex = await startMemoryIndex();

  const semantic = context.semanticSearch;

  return {
    index,
    vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
    messages: {
      index: messageIndex,
      vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
      cursor: makeMessageCursor(),
      lock: makeDeliveryLock(),
    },
  };
}
