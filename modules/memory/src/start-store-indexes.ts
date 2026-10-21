import type { DeliveryLock } from './make-delivery-lock';
import { makeDeliveryLock } from './make-delivery-lock';
import type { MessageCursor } from './make-message-cursor';
import { makeMessageCursor } from './make-message-cursor';
import type { MemoryIndex } from './start-memory-index';
import { startMemoryIndex } from './start-memory-index';
import type { VectorIndex } from './start-vector-index';
import { startVectorIndex } from './start-vector-index';
import type { MemoryContext } from './types';

interface MessageIndexes {
  readonly index: MemoryIndex;

  readonly vectors: VectorIndex | null;
  readonly cursor: MessageCursor;

  readonly lock: DeliveryLock;
}

export interface StoreIndexes {
  readonly index: MemoryIndex;

  readonly vectors: VectorIndex | null;
  readonly messages: MessageIndexes;
}

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
