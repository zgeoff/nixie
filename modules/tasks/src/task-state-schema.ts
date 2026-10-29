import { z } from 'zod';
import type { TaskState } from './types';

export const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'paused',
  'stopped',
  'failed',
  'done',
  'closed',
]) satisfies z.ZodType<TaskState>;
