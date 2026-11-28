import { taskReportToolName } from '@heynixie/tasks';
import { silentEndToolName } from '../turn/build-silent-end-tool';
import type { StartedRun } from './read-started-run';

// The start's record lists only the tools it named, and every task also gets silent end and report.
export function collectEndpointTools(run: Pick<StartedRun, 'options' | 'call'>): readonly string[] {
  return [
    ...new Set([
      ...run.options.tools,
      silentEndToolName,
      ...(run.call === null ? [taskReportToolName] : []),
    ]),
  ];
}
