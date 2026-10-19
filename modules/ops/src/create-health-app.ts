import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { Elysia } from 'elysia';
import { checkParts } from './check-parts';
import type { AdvisoryPart, DependencyPart, HealthPart, LivenessPart } from './health-parts';
import { makeHealthLog } from './make-health-log';
import type { HealthReport, PartCheck } from './types';

export interface HealthChecks {
  readonly liveness: Readonly<Record<LivenessPart, PartCheck>>;
  readonly readiness: Readonly<Record<HealthPart, PartCheck>>;

  // the parts whose failure makes the readiness status degraded instead of unready
  readonly dependencies: Readonly<Record<DependencyPart, PartCheck>>;

  // the parts the readiness report shows and its status never waits on
  readonly advisory: Readonly<Record<AdvisoryPart, PartCheck>>;

  // the longest one part's check runs before the part reports unready, 2 s by default
  readonly timeoutMs?: number;

  // the clock each check's timeout runs on, the system clock by default
  readonly clock?: Clock;

  // logs each part that turns unready or ready again, by name
  readonly log: Logger;
}

// Builds the health endpoint for the container runtime, with each part's report in the body. Only an
// unready readiness or liveness part answers 503: a failing dependency part answers 200 as degraded,
// so a slow impd never takes the only endpoint out of routing.
export function createHealthApp(checks: HealthChecks) {
  const timeoutMs = checks.timeoutMs ?? 2000;
  const clock = checks.clock ?? systemClock;
  const recordReport = makeHealthLog(checks.log);

  return new Elysia()
    .get('/health/live', async () => {
      const report = await checkParts(checks.liveness, timeoutMs, clock);

      recordReport('live', report);

      return renderReport(report);
    })
    .get('/health/ready', async () => {
      const [report, dependencies, advisory] = await Promise.all([
        checkParts(checks.readiness, timeoutMs, clock),
        checkParts(checks.dependencies, timeoutMs, clock),
        checkParts(checks.advisory, timeoutMs, clock),
      ]);

      const isDegraded = report.status === 'ready' && dependencies.status !== 'ready';

      const answer: HealthReport = {
        status: isDegraded ? 'degraded' : report.status,
        parts: report.parts,
        dependencies: dependencies.parts,
        advisory: advisory.parts,
      };

      recordReport('ready', answer);

      return renderReport(answer);
    });
}

function renderReport(report: HealthReport): Response {
  return Response.json(report, { status: report.status === 'unready' ? 503 : 200 });
}
