import { z } from 'zod';

export interface TasksConfig {
  readonly runners: number;
  readonly startedClaimLoops: number;
  readonly messaging: { readonly hopLimit: number };
}

const messagingSchema = z.strictObject({ hopLimit: z.int().positive().default(20) });

export const tasksConfigSchema = z
  .strictObject({
    runners: z.number().int().positive().default(3),
    startedClaimLoops: z.number().int().positive().default(2),
    messaging: messagingSchema.default({ hopLimit: 20 }),
  })
  .transform((config): TasksConfig => ({
    runners: config.runners,
    startedClaimLoops: config.startedClaimLoops,
    messaging: { hopLimit: config.messaging.hopLimit },
  }));
