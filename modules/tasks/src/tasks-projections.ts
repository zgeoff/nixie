import type { Projection } from '@heynixie/log';
import { taskMessagesProjection } from './task-messages-projection';
import { tasksProjection } from './tasks-projection';
import { timersProjection } from './timers-projection';

export const tasksProjections: readonly Projection[] = [
  tasksProjection,
  timersProjection,
  taskMessagesProjection,
];
