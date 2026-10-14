import type { CommentToolStore } from './build-comment-tool';
import type { DiffToolStore } from './build-diff-tool';
import type { PendingToolStore } from './build-pending-tool';
import type { ModelWriteStore } from './gate-types';
import type { StartedMemoryStore } from './start-memory-store';
import type { ItemIDStore } from './types';

// What the model's tools reach: recall, the pending proposals, the gated write paths, and the
// pending consolidation diff with its comment path. Nothing here answers a change.
export type MemoryToolStore = Pick<StartedMemoryStore, 'recall'> &
  PendingToolStore &
  DiffToolStore &
  CommentToolStore &
  ModelWriteStore &
  ItemIDStore;
