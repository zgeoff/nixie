import type { Logger } from '@heynixie/logger';
import type { HealthReport, PartReport } from './types';

export type HealthProbe = 'live' | 'ready';

const readyReport: PartReport = { isReady: true, reason: null };

export function makeHealthLog(log: Logger): (probe: HealthProbe, report: HealthReport) => void {
  const lastReports = new Map<string, PartReport>();

  return (probe, report) => {
    for (const [part, partReport] of collectPartReports(report)) {
      const key = `${probe}:${part}`;
      const last = lastReports.get(key) ?? readyReport;

      lastReports.set(key, partReport);

      if (!partReport.isReady && (last.isReady || last.reason !== partReport.reason)) {
        log('health.part_unready', { probe, part, reason: partReport.reason }, 'warn');
      }

      if (!last.isReady && partReport.isReady) {
        log('health.part_ready', { probe, part });
      }
    }
  };
}

function collectPartReports(report: HealthReport): (readonly [string, PartReport])[] {
  return [
    ...Object.entries(report.parts),
    ...Object.entries(report.dependencies ?? {}),
    ...Object.entries(report.advisory ?? {}),
  ];
}
