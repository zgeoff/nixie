import { z } from 'zod';

// what one worker run used, as the call's result and the end record both state it
export const workerUsedSchema = z.object({
  minutes: z.number().nonnegative(),
  turns: z.int().nonnegative(),
  tokens: z.int().nonnegative(),
  dollars: z.number().nonnegative(),
});

export type WorkerUsed = z.output<typeof workerUsedSchema>;
