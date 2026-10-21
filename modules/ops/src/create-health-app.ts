import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import { Elysia } from 'elysia';
import { checkParts } from './check-parts';
import type { AdvisoryPart, DependencyPart, HealthPart, LivenessPart } from './health-parts';
import { makeHealthLog } from './make-health-log';
import type { HealthReport, PartCheck, PartReport } from './types';

export interface HealthChecks {
  readonly liveness: Readonly<Record<Exclude<LivenessPart, 'process'>, PartCheck>>;
  readonly readiness: Readonly<Record<HealthPart, PartCheck>>;

  readonly dependencies: Readonly<Record<DependencyPart, PartCheck>>;

  readonly advisory: Readonly<Record<AdvisoryPart, PartCheck>>;

  readonly timeoutMs?: number;

  readonly clock?: Clock;

  readonly log: Logger;
}

export function createHealthApp(checks: HealthChecks) {
  const timeoutMs = checks.timeoutMs ?? 2000;
  const clock = checks.clock ?? systemClock;
  const recordReport = makeHealthLog(checks.log);

  return new Elysia()
    .get('/health/live', async () => {
      const report = await checkParts(
        { process: checkProcess, ...checks.liveness },
        timeoutMs,
        clock,
      );

      recordReport('live', report);

      return renderReport(report);
    })
    .get('/health/ready', async () => {
      const [report, dependencies, advisory] = await Promise.all([
        checkParts(checks.readiness, timeoutMs, clock),
        checkParts(checks.dependencies, timeoutMs, clock),
        checkParts(checks.advisory, timeoutMs, clock),
      ]);

      // The container runtime takes a 503 endpoint out of routing, and nixie runs as the only
      // endpoint, so a failing dependency answers 200 as degraded.
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

function checkProcess(): Promise<PartReport> {
  return Promise.resolve({ isReady: true, reason: null });
}

function renderReport(report: HealthReport): Response {
  return Response.json(report, { status: report.status === 'unready' ? 503 : 200 });
}
