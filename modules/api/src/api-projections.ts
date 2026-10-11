import type { Projection } from '@heynixie/log';
import { refusalsProjection } from './refusals-projection';

// The projections the API owns, which the server appends to the log's list after the tasks
// projections.
export const apiProjections: readonly Projection[] = [refusalsProjection];
