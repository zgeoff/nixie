import type { z } from 'zod';
import type { healthReportSchema } from './health-report-schema';

export type HealthReport = z.infer<typeof healthReportSchema>;

export type PartReport = HealthReport['parts'][string];

export type PartCheck = (signal?: AbortSignal) => Promise<PartReport>;
