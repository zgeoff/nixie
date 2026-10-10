import type { JSONObject } from '@heynixie/log';
import { Server } from '@modelcontextprotocol/server';
import type { ToolCallOptions } from './run-tool-call';
import { runToolCall } from './run-tool-call';
import type { ToolRun } from './types';

// Builds the MCP server for one request to a run's endpoint. tools/list lists only the tools on the
// run's list, and tools/call takes every call to the call steps, a tool missing from the list
// included, so the decision point's scope stage still decides it.
// oxlint-disable-next-line typescript/no-deprecated -- McpServer answers a call to a tool it does not list itself, so the scope stage would never see it
export function buildRunServer(run: ToolRun, options: ToolCallOptions): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );
  const tools = run.tools.flatMap((name) => {
    const registered = options.registry.findTool(name);

    // the model sees the name, the description and the input schema, and nothing else
    return registered === null
      ? []
      : [
          {
            name,
            description: registered.definition.description,
            inputSchema: { ...registered.definition.input, type: 'object' as const },
          },
        ];
  });

  server.setRequestHandler('tools/list', () => ({ tools }));
  server.setRequestHandler('tools/call', (request) =>
    runToolCall(
      {
        tool: request.params.name,

        // the arguments arrived as JSON, so every value in them is JSON
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- parsed from the request body
        input: (request.params.arguments ?? {}) as JSONObject,

        // oxlint-disable-next-line no-underscore-dangle -- _meta is the MCP field's name
        toolUseID: findToolUseID(request.params._meta),
      },
      run,
      options,
    ),
  );
  return server;
}

// Claude Code sends the model's tool-use ID on every tools/call, so the call's record joins its turn.
function findToolUseID(meta: Readonly<Record<string, unknown>> | undefined): string | null {
  const toolUseID = meta?.['claudecode/toolUseId'];

  return typeof toolUseID === 'string' ? toolUseID : null;
}
