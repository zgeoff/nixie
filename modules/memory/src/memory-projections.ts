import type { Projection } from '@heynixie/log';
import { memoryItemsProjection } from './memory-items-projection';
import { memoryVersionsProjection } from './memory-versions-projection';

// The projections memory owns, in fold order: a version row refers to its item's row. The server
// appends them to the log's own projections.
export const memoryProjections: readonly Projection[] = [
  memoryItemsProjection,
  memoryVersionsProjection,
];
