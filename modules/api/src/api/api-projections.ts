import type { Projection } from '@heynixie/log';
import { refusalsProjection } from '../refusal/refusals-projection';

export const apiProjections: readonly Projection[] = [refusalsProjection];
