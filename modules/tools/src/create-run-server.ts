import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { Server } from '@modelcontextprotocol/server';
import type { ToolCallOptions } from './run-tool-call';
import { runToolCall } from './run-tool-call';
import type { GuestToolRun } from './types';

// oxlint-disable-next-line typescript/no-deprecated -- McpServer answers a call to a tool it does not list itself, so the scope stage would never see it
export function createRunServer(guestRun: GuestToolRun, options: ToolCallOptions): Server {
  const { toolUseMetaKey, ...run } = guestRun;

  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  const tools = run.tools.flatMap((name) => {
    const registered = options.registry.findTool(name);

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
        input: JSON_OBJECT_SCHEMA.parse(request.params.arguments ?? {}),

        // oxlint-disable-next-line no-underscore-dangle -- _meta is the MCP field's name
        toolUseID: findToolUseID(request.params._meta, toolUseMetaKey),
      },
      run,
      options,
    ),
  );

  return server;
}

// The guest sends the model's tool-use ID on every tools/call, so the call's record joins its turn.
function findToolUseID(
  meta: Readonly<Record<string, unknown>> | undefined,
  key: string | null,
): string | null {
  const toolUseID = key === null ? undefined : meta?.[key];

  return typeof toolUseID === 'string' ? toolUseID : null;
}
