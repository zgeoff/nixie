import { z } from 'zod';
import type { TaskState } from './types';

export const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'failed',
  'done',
]) satisfies z.ZodType<TaskState>;
