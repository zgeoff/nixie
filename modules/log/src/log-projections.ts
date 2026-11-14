import { nixiePauseProjection } from './nixie-pause-projection';
import { pauseExemptionsProjection } from './pause-exemptions-projection';
import { recoveriesProjection } from './recoveries-projection';
import { threadsProjection } from './threads-projection';
import type { Projection } from './types';

export const logProjections: readonly Projection[] = [
  threadsProjection,
  nixiePauseProjection,
  pauseExemptionsProjection,
  recoveriesProjection,
];
