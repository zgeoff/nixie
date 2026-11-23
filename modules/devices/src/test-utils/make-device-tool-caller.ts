import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ToolContext, ToolDefinition, ToolRun } from '@heynixie/tools';
import { buildDeviceTools } from '../tool/build-device-tools';
import type { DeviceToolOptions } from '../tool/device-tool-options';

// Calls a device tool as the conversation's turn does, and answers the tool's outcome.
export function makeDeviceToolCaller(options: DeviceToolOptions) {
  const tools = buildDeviceTools(options);

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: tools.map((tool) => tool.name),
    model: { model: 'model-a', profile: 'chat-direct' },
  };

  return async (tool: string, input: JSONObject) => {
    // the call's own record comes after every record the log holds
    const [newest] = await readRecords(options.log, {
      afterSequence: 0,
      order: 'newest',
      limit: 1,
    });

    const context: ToolContext = { callSequence: (newest?.record.sequence ?? 0) + 1, run };

    return await findTool(tools, tool).run(
      { callID: 'call-1', tool, input: structuredClone(input), toolUseID: null },
      context,
    );
  };
}

function findTool(tools: readonly ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((tool) => tool.name === name);

  if (found === undefined) {
    throw new Error(`no device tool is named ${name}`);
  }

  return found;
}
