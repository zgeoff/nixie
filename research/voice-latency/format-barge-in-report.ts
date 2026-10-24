import type { BargeInRecord } from './barge-in-record.ts';

// A markdown table with one row per candidate: how long a reply went on after the caller cut in,
// how often it never stopped, and how often it spoke again afterwards.
export function formatBargeInReport(records: BargeInRecord[]): string {
  const candidates = [...new Set(records.map((record) => record.candidate))];
  const rows = candidates.map((candidate) => {
    const runs = records.filter((record) => record.candidate === candidate);
    const failed = runs.filter((run) => run.error !== undefined || !run.interrupted);
    const interrupted = runs.filter((run) => run.error === undefined && run.interrupted);
    const stops = interrupted.flatMap((run) => (run.stopMs === undefined ? [] : [run.stopMs]));
    const sorted = stops.toSorted((first, second) => first - second);
    const median = sorted[Math.floor(sorted.length / 2)];
    const longest = sorted.at(-1);
    return [
      candidate,
      String(runs.length),
      median === undefined || longest === undefined ? '-' : `${Math.round(median)} / ${Math.round(longest)} ms`,
      String(interrupted.length - stops.length),
      `${interrupted.filter((run) => run.spokeAfterStop).length} of ${interrupted.length}`,
      String(failed.length),
    ];
  });
  return [
    '| Candidate | Runs | Reply went on after the interruption, median / longest | Never stopped | Spoke again after stopping | Failed |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}
