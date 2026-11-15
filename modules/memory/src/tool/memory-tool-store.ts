import type { ModelWriteStore } from '../gate/gate-context';
import type { StartedMemoryStore } from '../memory/start-memory-store';
import type { MomentStore } from '../moment/store/build-moment-store';
import type { PendingToolStore } from '../pending/build-pending-tool';
import type { ItemIDStore } from '../types';

// Only the client destroys a moment, so the model's tools reach every moment call but the destroy
// and the client's whole view, which the model reads a page at a time instead.
export type MomentToolStore = Omit<
  MomentStore,
  'readView' | 'readDestroyPreview' | 'destroy' | 'finishDestroy'
>;

export type MemoryToolStore = Pick<StartedMemoryStore, 'recall' | 'rate'> & {
  readonly moments: MomentToolStore;
} & PendingToolStore &
  ModelWriteStore &
  ItemIDStore;
