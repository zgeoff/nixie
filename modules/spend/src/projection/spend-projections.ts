import type { Projection } from '@heynixie/log';
import { spendRaisesProjection } from './spend-raises-projection';
import { spendRouteRaisesProjection } from './spend-route-raises-projection';
import { spendTurnsProjection } from './spend-turns-projection';

export const spendProjections: readonly Projection[] = [
  spendRaisesProjection,
  spendRouteRaisesProjection,
  spendTurnsProjection,
];
