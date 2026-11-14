import { z } from 'zod';

export interface ActionsConfig {
  readonly runners: number;
}

export const actionsConfigSchema = z
  .strictObject({ runners: z.number().int().positive().default(4) })
  .transform((config): ActionsConfig => ({ runners: config.runners }));
