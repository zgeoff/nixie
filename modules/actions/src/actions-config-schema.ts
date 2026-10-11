import { z } from 'zod';

// The actions section of the deployment configuration: the size of the action runner pool, 4
// attempts at once by default, apart from the task runners.
export const actionsConfigSchema = z
  .strictObject({ runners: z.number().int().positive().default(4) })
  .transform((config): ActionsConfig => ({ runners: config.runners }));

export interface ActionsConfig {
  readonly runners: number;
}
