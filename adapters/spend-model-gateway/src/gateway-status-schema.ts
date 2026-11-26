import { z } from 'zod';

const periodSchema = z.looseObject({
  start: z.string(),
  resetsAt: z.string(),
  dollars: z.number(),
  limit: z.number().nullable(),
  cap: z.number().nullable(),
  tripped: z.boolean(),
  sinceMs: z.number().nullable(),
});

export const gatewayStatusSchema = z.looseObject({
  zone: z.string(),
  lost: z.boolean(),
  routes: z.record(z.string(), z.looseObject({ day: periodSchema, month: periodSchema })),
});
