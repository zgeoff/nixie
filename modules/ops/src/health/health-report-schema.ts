import { z } from 'zod';

const detailSchema = z.union([z.string(), z.number()]).nullable();

const partReportSchema = z
  .object({
    isReady: z.boolean(),
    reason: z.string().nullable(),
    details: z.record(z.string(), detailSchema).readonly().optional(),
  })
  .readonly();

const partReportsSchema = z.record(z.string(), partReportSchema).readonly();

export const healthReportSchema = z
  .object({
    status: z.enum(['ready', 'degraded', 'unready']),
    parts: partReportsSchema,
    dependencies: partReportsSchema.optional(),
    advisory: partReportsSchema.optional(),
  })
  .readonly();
