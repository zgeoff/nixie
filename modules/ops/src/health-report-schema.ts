import { z } from 'zod';

const partReportSchema = z
  .object({ isReady: z.boolean(), reason: z.string().nullable() })
  .readonly();

const partReportsSchema = z.record(z.string(), partReportSchema).readonly();

// The body of a liveness or a readiness answer, which the health endpoint writes and a deployment's
// check parses. Readiness adds the dependency parts, whose failure makes a ready status degraded,
// and the advisory parts, which never change the status.
export const healthReportSchema = z
  .object({
    status: z.enum(['ready', 'degraded', 'unready']),
    parts: partReportsSchema,
    dependencies: partReportsSchema.optional(),
    advisory: partReportsSchema.optional(),
  })
  .readonly();
