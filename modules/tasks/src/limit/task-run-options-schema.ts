import { z } from 'zod';
import { reportShapeSchema } from '../report/report-shape-schema';
import type { TaskRunOptions } from '../types';
import { taskLimitsSchema } from './task-limits-schema';

export const taskRunOptionsSchema = z.object({
  model: z.string().nullable(),
  profile: z.string().nullable(),
  persona: z.enum(['default', 'none']),
  memory: z.enum(['none', 'read', 'self_notes']),
  log: z.enum(['own', 'conversation']).default('own'),
  tools: z.string().array(),
  report: z.enum(['wake', 'next_turn', 'none']),
  limits: taskLimitsSchema,
  reportShape: reportShapeSchema.exactOptional(),
  connectionPins: z.record(z.string(), z.string().array()).exactOptional(),
}) satisfies z.ZodType<TaskRunOptions>;
