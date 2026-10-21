import type { CommentToolStore } from './build-comment-tool';
import type { DiffToolStore } from './build-diff-tool';
import type { PendingToolStore } from './build-pending-tool';
import type { ModelWriteStore } from './gate-types';
import type { StartedMemoryStore } from './start-memory-store';
import type { ItemIDStore } from './types';

export type MemoryToolStore = Pick<StartedMemoryStore, 'recall' | 'rate'> &
  PendingToolStore &
  DiffToolStore &
  CommentToolStore &
  ModelWriteStore &
  ItemIDStore;
