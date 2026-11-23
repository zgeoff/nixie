import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition, ToolResolveContext } from '@heynixie/tools';
import { buildDeviceTools } from '../tool/build-device-tools';
import type { DeviceToolOptions } from '../tool/device-tool-options';

// Reads what a device tool reads about a call before the decision point asks, as the turn does:
// the destinations the call would be approved for, or the refusal that ends it.
export function makeDeviceToolPreparer(options: DeviceToolOptions) {
  const tools = buildDeviceTools(options);

  const context: ToolResolveContext = {
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: tools.map((tool) => tool.name),
      model: { model: 'model-a', profile: 'chat-direct' },
    },
  };

  return async (tool: string, input: JSONObject) => {
    const prepare = findTool(tools, tool).prepare;

    if (prepare === undefined) {
      throw new Error(`${tool} reads nothing before its call`);
    }

    return await prepare(structuredClone(input), context);
  };
}

function findTool(tools: readonly ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((tool) => tool.name === name);

  if (found === undefined) {
    throw new Error(`no device tool is named ${name}`);
  }

  return found;
}
