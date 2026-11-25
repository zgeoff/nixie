import { taskReportToolName } from '@heynixie/tasks';
import { hangUpToolName } from '../call/build-hang-up-tool';

// The conversation's tools that a call never holds: ringing, starting a task, running a worker, and
// the report that ends a task's run.
const callExcludedTools: ReadonlySet<string> = new Set([
  'call.ring',
  'task.start',
  'worker.run',
  taskReportToolName,
]);

// A call holds the conversation's tool list, less the tools that start work, ring or end a run,
// and it adds the tool that ends the call.
export function pickCallTools(conversationToolNames: readonly string[]): readonly string[] {
  return [
    ...conversationToolNames.filter(
      (tool) => !callExcludedTools.has(tool) && tool !== hangUpToolName,
    ),
    hangUpToolName,
  ];
}
