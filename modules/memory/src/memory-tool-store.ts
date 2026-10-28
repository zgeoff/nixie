import type { CommentToolStore } from './build-comment-tool';
import type { DiffToolStore } from './build-diff-tool';
import type { MomentStore } from './build-moment-store';
import type { PendingToolStore } from './build-pending-tool';
import type { ModelWriteStore } from './gate-types';
import type { StartedMemoryStore } from './start-memory-store';
import type { ItemIDStore } from './types';

// Only the client destroys a moment, so the model's tools reach every moment call but the destroy
// and the client's whole view, which the model reads a page at a time instead.
export type MomentToolStore = Omit<
  MomentStore,
  'readView' | 'readDestroyPreview' | 'destroy' | 'finishDestroy'
>;

export type MemoryToolStore = Pick<StartedMemoryStore, 'recall' | 'rate'> & {
  readonly moments: MomentToolStore;
} & PendingToolStore &
  DiffToolStore &
  CommentToolStore &
  ModelWriteStore &
  ItemIDStore;
