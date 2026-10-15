import { Elysia } from 'elysia';
import { checkParts } from './check-parts';
import type { HealthPart, LivenessPart } from './health-parts';
import type { PartCheck } from './types';

export interface HealthChecks {
  readonly liveness: Readonly<Record<LivenessPart, PartCheck>>;
  readonly readiness: Readonly<Record<HealthPart, PartCheck>>;

  // the longest one part's check runs before the part reports unready, 2 s by default
  readonly timeoutMs?: number;
}

// Builds the health endpoint for the container runtime: /health/live and /health/ready each answer
// 200 when every part is ready and 503 otherwise, with each part's report in the body.
export function buildHealthApp(checks: HealthChecks) {
  const timeoutMs = checks.timeoutMs ?? 2000;

  const renderReport = async (parts: Readonly<Record<string, PartCheck>>) => {
    const report = await checkParts(parts, timeoutMs);

    return Response.json(report, { status: report.status === 'ready' ? 200 : 503 });
  };

  return new Elysia()
    .get('/health/live', () => renderReport(checks.liveness))
    .get('/health/ready', () => renderReport(checks.readiness));
}
