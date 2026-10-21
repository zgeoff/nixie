import { z } from 'zod';

const partReportSchema = z
  .object({ isReady: z.boolean(), reason: z.string().nullable() })
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
