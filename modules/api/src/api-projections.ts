import type { Projection } from '@heynixie/log';
import { refusalsProjection } from './refusals-projection';

export const apiProjections: readonly Projection[] = [refusalsProjection];
