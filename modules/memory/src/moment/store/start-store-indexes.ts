import type { LabelEntries } from '../../label/make-label-entries';
import { makeLabelEntries } from '../../label/make-label-entries';
import type { MemoryIndex } from '../../memory/start-memory-index';
import { startMemoryIndex } from '../../memory/start-memory-index';
import type { MessageCursor } from '../../message/make-message-cursor';
import { makeMessageCursor } from '../../message/make-message-cursor';
import type { MemoryContext } from '../../types';
import type { DeliveryLock } from '../../utils/make-delivery-lock';
import { makeDeliveryLock } from '../../utils/make-delivery-lock';
import type { VectorIndex } from '../../view/start-vector-index';
import { startVectorIndex } from '../../view/start-vector-index';

interface MessageIndexes {
  readonly index: MemoryIndex;

  readonly vectors: VectorIndex | null;
  readonly cursor: MessageCursor;

  readonly lock: DeliveryLock;
}

export interface MomentIndexes {
  readonly vectors: VectorIndex | null;

  // the moments projection's updated sequence that the index has read through
  readonly cursor: { through: number };
  readonly lock: DeliveryLock;
}

export interface StoreIndexes {
  readonly index: MemoryIndex;

  readonly labels: LabelEntries;

  readonly vectors: VectorIndex | null;
  readonly messages: MessageIndexes;
  readonly moments: MomentIndexes;
}

export async function startStoreIndexes(context: MemoryContext): Promise<StoreIndexes> {
  const index = await startMemoryIndex();
  const messageIndex = await startMemoryIndex();

  const semantic = context.semanticSearch;

  return {
    index,
    labels: makeLabelEntries(),
    vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
    messages: {
      index: messageIndex,
      vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
      cursor: makeMessageCursor(),
      lock: makeDeliveryLock(),
    },
    moments: {
      vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
      cursor: { through: 0 },
      lock: makeDeliveryLock(),
    },
  };
}
