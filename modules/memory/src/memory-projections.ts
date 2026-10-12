import type { Projection } from '@heynixie/log';
import { memoryItemsProjection } from './memory-items-projection';
import { memoryVersionsProjection } from './memory-versions-projection';
import { memoryWriterProjection } from './memory-writer-projection';

// The projections memory owns, in fold order: a version row refers to its item's row, and the
// writer's row stands apart. The server appends them to the log's own projections.
export const memoryProjections: readonly Projection[] = [
  memoryItemsProjection,
  memoryVersionsProjection,
  memoryWriterProjection,
];
