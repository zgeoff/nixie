import type { Projection } from '@heynixie/log';
import { spendRaisesProjection } from './spend-raises-projection';
import { spendStopProjection } from './spend-stop-projection';
import { spendTurnsProjection } from './spend-turns-projection';

export const spendProjections: readonly Projection[] = [
  spendStopProjection,
  spendRaisesProjection,
  spendTurnsProjection,
];
