import type { Projection } from '@heynixie/log';
import { tasksProjection } from './tasks-projection';
import { timersProjection } from './timers-projection';

export const tasksProjections: readonly Projection[] = [tasksProjection, timersProjection];
