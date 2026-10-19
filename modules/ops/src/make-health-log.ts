import type { Logger } from '@heynixie/logger';
import type { HealthReport, PartReport } from './types';

export type HealthProbe = 'live' | 'ready';

// Makes the recorder that logs a part of a health answer by name when it turns unready or its reason
// changes, and when it turns ready again. A part logs only when it changes, so a probe every few
// seconds never floods the log.
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

// what a part counts as before its first answer, so a part unready at its first answer logs
const readyReport: PartReport = { isReady: true, reason: null };
