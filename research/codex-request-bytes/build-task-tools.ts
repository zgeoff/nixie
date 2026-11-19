// The tool definitions a started task's model sees by default: the default tool list, plus the
// silent end and the report that every task run gets. The production builders build them with
// stand-in stores. The model reads only each tool's name, description and input schema, and the
// stand-in stores are never reached.
// @boundaries-ignore a spike imports the code it measures
import { buildTimeTool } from '../../modules/connectors/src/time/build-time-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildSilentEndTool } from '../../modules/sessions/src/turn/build-silent-end-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildTaskReportTool } from '../../modules/tasks/src/report/build-task-report-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildTasksListTool } from '../../modules/tasks/src/task/build-tasks-list-tool';
// @boundaries-ignore a spike imports the code it measures
import { buildTaskMessageTool } from '../../modules/tasks/src/task/projection/build-task-message-tool';
// @boundaries-ignore a spike imports the code it measures
import { startedTaskDefaultTools } from '../../modules/tasks/src/task/started-task-default-tools';
import type { ListedTool } from './start-tool-server';

const unused = {} as never;
const ownerName = 'Sam';

export function buildTaskTools(): readonly ListedTool[] {
  const definitions = [
    buildTasksListTool(unused, unused),
    buildTaskMessageTool(unused, { ownerName } as never),
    buildTaskReportTool(unused),
    buildTimeTool({
      clock: { now: () => Date.now() },
      findTimeZone: () => Promise.resolve(null),
      defaultZone: 'Europe/Lisbon',
    }),
    buildSilentEndTool({ ownerName }),
  ];
  const names = new Set(definitions.map((tool) => tool.name));
  const missing = startedTaskDefaultTools.filter((name) => !names.has(name));

  if (missing.length > 0) {
    throw new Error(`the spike builds no ${missing.join(', ')}, which a started task gets`);
  }

  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input: tool.input as Record<string, unknown>,
  }));
}
