import type { CommentToolStore } from './build-comment-tool';
import type { DiffToolStore } from './build-diff-tool';
import type { MomentStore } from './build-moment-store';
import type { PendingToolStore } from './build-pending-tool';
import type { ModelWriteStore } from './gate-types';
import type { StartedMemoryStore } from './start-memory-store';
import type { ItemIDStore } from './types';

// Only the client destroys a moment, so the model's tools reach every moment call but the destroy.
export type MomentToolStore = Omit<MomentStore, 'readDestroyPreview' | 'destroy' | 'finishDestroy'>;

export type MemoryToolStore = Pick<StartedMemoryStore, 'recall' | 'rate'> & {
  readonly moments: MomentToolStore;
} & PendingToolStore &
  DiffToolStore &
  CommentToolStore &
  ModelWriteStore &
  ItemIDStore;
