import type { JSONObject } from '@heynixie/log';
import type { ToolContext, ToolDefinition } from '@heynixie/tools';
import { buildDeviceTools } from '../tool/build-device-tools';
import type { DeviceToolOptions } from '../tool/device-tool-options';

// Calls a device tool as the conversation's turn does, and answers the tool's outcome.
export function buildDeviceToolCaller(options: DeviceToolOptions) {
  const tools = buildDeviceTools(options);

  const context: ToolContext = {
    callSequence: 1,
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: tools.map((tool) => tool.name),
      model: { model: 'model-a', profile: 'chat-direct' },
    },
  };

  return (tool: string, input: JSONObject) =>
    findTool(tools, tool).run(
      { callID: 'call-1', tool, input: structuredClone(input), toolUseID: null },
      context,
    );
}

function findTool(tools: readonly ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((tool) => tool.name === name);

  if (found === undefined) {
    throw new Error(`no device tool is named ${name}`);
  }

  return found;
}
