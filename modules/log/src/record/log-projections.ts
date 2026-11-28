import type { Projection } from '../types';
import { expiredKeysProjection } from './expired-keys-projection';
import { nixiePauseProjection } from './nixie-pause-projection';
import { pauseExemptionsProjection } from './pause-exemptions-projection';
import { recoveriesProjection } from './recoveries-projection';
import { spendProviderHoldsProjection } from './spend-provider-holds-projection';
import { spendProviderStopsProjection } from './spend-provider-stops-projection';
import { spendRouteHoldsProjection } from './spend-route-holds-projection';
import { spendRouteStopsProjection } from './spend-route-stops-projection';
import { spendStopProjection } from './spend-stop-projection';
import { threadsProjection } from './threads-projection';

export const logProjections: readonly Projection[] = [
  threadsProjection,
  expiredKeysProjection,
  nixiePauseProjection,
  pauseExemptionsProjection,
  recoveriesProjection,
  spendStopProjection,
  spendRouteStopsProjection,
  spendRouteHoldsProjection,
  spendProviderStopsProjection,
  spendProviderHoldsProjection,
];
