import { z } from 'zod';

const partsSchema = z.record(z.string(), z.object({ isReady: z.boolean() })).optional();

export const readinessReportSchema = z.object({
  status: z.enum(['ready', 'degraded', 'unready']),
  parts: partsSchema,
  dependencies: partsSchema,
});

export type ReadinessReport = z.infer<typeof readinessReportSchema>;

// A degraded nixie still answers, but a dependency such as impd fails it, so the check refuses it as
// it refuses an unready one, and names each failing part.
export function pickHealthRefusal(report: ReadinessReport): string | null {
  if (report.status === 'ready') {
    return null;
  }

  const failing = Object.entries({ ...report.parts, ...report.dependencies })
    .filter(([, part]) => !part.isReady)
    .map(([name]) => name);

  return `nixie reports ${report.status}${failing.length === 0 ? '' : `: ${failing.join(', ')}`}`;
}
