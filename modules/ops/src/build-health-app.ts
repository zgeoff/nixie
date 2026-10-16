import { Elysia } from 'elysia';
import { checkParts } from './check-parts';
import type { AdvisoryPart, HealthPart, LivenessPart } from './health-parts';
import type { HealthReport, PartCheck } from './types';

export interface HealthChecks {
  readonly liveness: Readonly<Record<LivenessPart, PartCheck>>;
  readonly readiness: Readonly<Record<HealthPart, PartCheck>>;

  // the parts the readiness report shows and its status never waits on
  readonly advisory: Readonly<Record<AdvisoryPart, PartCheck>>;

  // the longest one part's check runs before the part reports unready, 2 s by default
  readonly timeoutMs?: number;
}

// Builds the health endpoint for the container runtime: /health/live and /health/ready each answer
// 200 when every part is ready and 503 otherwise, with each part's report in the body. Readiness
// adds each advisory part's report, which never changes the status.
export function buildHealthApp(checks: HealthChecks) {
  const timeoutMs = checks.timeoutMs ?? 2000;

  return new Elysia()
    .get('/health/live', async () => {
      const report = await checkParts(checks.liveness, timeoutMs);

      return renderReport(report);
    })
    .get('/health/ready', async () => {
      const [report, advisory] = await Promise.all([
        checkParts(checks.readiness, timeoutMs),
        checkParts(checks.advisory, timeoutMs),
      ]);

      return renderReport({ ...report, advisory: advisory.parts });
    });
}

function renderReport(report: HealthReport): Response {
  return Response.json(report, { status: report.status === 'ready' ? 200 : 503 });
}
