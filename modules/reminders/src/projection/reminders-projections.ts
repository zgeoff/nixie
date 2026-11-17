import type { Projection } from '@heynixie/log';
import { remindersProjection } from './reminders-projection';

export const remindersProjections: readonly Projection[] = [remindersProjection];
