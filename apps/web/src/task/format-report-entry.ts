import type { ContractOutputs } from '@heynixie/contract';
import { formatLateness } from '../components/format-lateness';

export type ReportEntry = ContractOutputs['triggers']['report']['entries'][number];

const reasons: Readonly<Record<string, string>> = {
  too_late: 'it came too late to run',
  catch_up_off: 'catching up is off for it',
  window_closed: 'its window had closed',
  still_running: 'its last run was still going',
  task_held: 'its task was held',
};

// One line of the trigger report: a fire that came late, or a fire that nixie skipped and why
export function formatReportEntry(entry: ReportEntry): string {
  if (entry.kind === 'late') {
    const lateness =
      entry.lateBySeconds === null ? '' : `, ${formatLateness(entry.lateBySeconds)} late`;

    return `${entry.name}: fired late${lateness} (scheduled for ${entry.scheduledFor})`;
  }

  const reason = entry.reason === null ? undefined : reasons[entry.reason];

  return `${entry.name}: skipped${reason === undefined ? '' : `, because ${reason}`} (scheduled for ${entry.scheduledFor})`;
}
