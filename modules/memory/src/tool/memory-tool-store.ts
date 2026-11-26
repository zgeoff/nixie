import type { MemoryProposals, ModelWriteStore } from '../gate/gate-context';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import type { MomentStore } from '../moment/store/build-moment-store';
import type { ItemIDStore } from '../types';

// Only the client destroys a moment, so the model's tools reach every moment call but the destroy
// and the client's whole view, which the model reads a page at a time instead.
export type MomentToolStore = Omit<
  MomentStore,
  'readView' | 'readDestroyPreview' | 'beginDestroy' | 'finishDestroy' | 'readDestroyedSequence'
>;

export type MemoryToolStore = Pick<
  StartedMemoryStore,
  'recall' | 'readTopicLines' | 'readTopicCounts' | 'readUsage' | 'readSavedTimes' | 'readUsageList'
> & {
  readonly moments: MomentToolStore;
} & { readonly proposals: Pick<MemoryProposals, 'listPending'> } & ModelWriteStore &
  ItemIDStore;

// The store the conversation holds: the model's tools, and the lookup that other modules' tools use.
export type ConversationMemoryStore = MemoryToolStore & Pick<StartedMemoryStore, 'readRelated'>;
