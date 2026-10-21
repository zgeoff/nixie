import { z } from 'zod';

export interface TasksConfig {
  readonly runners: number;
}

export const tasksConfigSchema = z
  .strictObject({ runners: z.number().int().positive().default(3) })
  .transform((config): TasksConfig => ({ runners: config.runners }));
