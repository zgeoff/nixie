import { z } from 'zod';
import type { TaskState } from './types';

// A task's state as a task record's payload holds it.
export const taskStateSchema = z.enum([
  'ready',
  'running',
  'waiting',
  'failed',
  'done',
]) satisfies z.ZodType<TaskState>;
