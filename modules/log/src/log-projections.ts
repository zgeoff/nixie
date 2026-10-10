import { threadsProjection } from './threads-projection';
import type { Projection } from './types';

// The projections the log itself owns. A module with its own projections appends them to this list
// where the server builds the log.
export const logProjections: readonly Projection[] = [threadsProjection];
