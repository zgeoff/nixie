import { z } from 'zod';

export interface TasksConfig {
  readonly runners: number;
}

// The tasks section of the deployment configuration: the size of the task runner pool, 3 steps at
// once by default, the limit on concurrent work in tier 2.
export const tasksConfigSchema = z
  .strictObject({ runners: z.number().int().positive().default(3) })
  .transform((config): TasksConfig => ({ runners: config.runners }));
