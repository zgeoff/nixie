import type { Projection } from '@heynixie/log';
import { tasksProjection } from './tasks-projection';
import { timersProjection } from './timers-projection';

// The projections tasks owns, in fold order: a timer row refers to its task's row. The server
// appends them to the log's own projections.
export const tasksProjections: readonly Projection[] = [tasksProjection, timersProjection];
