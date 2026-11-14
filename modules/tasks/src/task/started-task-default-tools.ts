import { taskReportToolName } from '../report/task-report-tool-name';

// Every task reaches the others through these tools and ends its run with the last, so a start
// never leaves them out.
export const startedTaskBaseTools: readonly string[] = [
  'tasks.list',
  'task.message',
  taskReportToolName,
];

export const startedTaskDefaultTools: readonly string[] = [...startedTaskBaseTools, 'time.now'];
