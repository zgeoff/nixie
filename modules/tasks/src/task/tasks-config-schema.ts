import { z } from 'zod';

export interface WorkerRunsConfig {
  readonly max: number;
  readonly whenFull: 'wait' | 'error';
}

export interface TasksConfig {
  readonly runners: number;
  readonly startedClaimLoops: number;
  readonly messaging: { readonly hopLimit: number };

  // the most worker runs at once; absent means no cap
  readonly workerRuns?: WorkerRunsConfig;
}

const messagingSchema = z.strictObject({ hopLimit: z.int().positive().default(20) });

const workerRunsSchema = z.strictObject({
  max: z.int().positive(),
  whenFull: z.enum(['wait', 'error']),
});

export const tasksConfigSchema = z
  .strictObject({
    runners: z.number().int().positive().default(3),
    startedClaimLoops: z.number().int().positive().default(2),
    messaging: messagingSchema.default({ hopLimit: 20 }),
    workerRuns: workerRunsSchema.optional(),
  })
  .transform((config): TasksConfig => ({
    runners: config.runners,
    startedClaimLoops: config.startedClaimLoops,
    messaging: { hopLimit: config.messaging.hopLimit },
    ...(config.workerRuns === undefined ? {} : { workerRuns: config.workerRuns }),
  }));
