import type { TaskReport } from '../types';
import type { RunSettings } from './types';

export function pickReportMode(
  given: TaskReport | undefined,
  from: 'start' | 'definition',
  settings: Pick<RunSettings, 'reportDefaults'>,
): TaskReport {
  return given ?? settings.reportDefaults[from];
}
