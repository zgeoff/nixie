import type { Projection } from '../types';
import { nixiePauseProjection } from './nixie-pause-projection';
import { pauseExemptionsProjection } from './pause-exemptions-projection';
import { recoveriesProjection } from './recoveries-projection';
import { spendRouteHoldsProjection } from './spend-route-holds-projection';
import { spendRouteStopsProjection } from './spend-route-stops-projection';
import { spendStopProjection } from './spend-stop-projection';
import { threadsProjection } from './threads-projection';

export const logProjections: readonly Projection[] = [
  threadsProjection,
  nixiePauseProjection,
  pauseExemptionsProjection,
  recoveriesProjection,
  spendStopProjection,
  spendRouteStopsProjection,
  spendRouteHoldsProjection,
];
