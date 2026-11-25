import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { Server } from '@modelcontextprotocol/server';
import type { ToolCallOptions } from './run-tool-call';
import { runToolCall } from './run-tool-call';
import type { GuestToolRun } from './types';

// oxlint-disable-next-line typescript/no-deprecated -- McpServer answers a call to a tool it does not list itself, so the scope stage would never see it
export function createRunServer(guestRun: GuestToolRun, options: ToolCallOptions): Server {
  const { toolUseMetaKey, parent, ...run } = guestRun;

  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  // the run's tools minus the ones held back at the moment of the request
  const readLiveTools = async (): Promise<readonly string[]> => {
    const heldBackNames = await options.readHeldBackTools?.();

    const heldBack = new Set(heldBackNames);

    return run.tools.filter((name) => !heldBack.has(name));
  };

  server.setRequestHandler('tools/list', async () => {
    const live = await readLiveTools();

    const tools = live.flatMap((name) => {
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

    return { tools };
  });

  server.setRequestHandler('tools/call', async (request) => {
    const live = await readLiveTools();

    return runToolCall(
      {
        tool: request.params.name,
        input: JSON_OBJECT_SCHEMA.parse(request.params.arguments ?? {}),

        // oxlint-disable-next-line no-underscore-dangle -- _meta is the MCP field's name
        toolUseID: findToolUseID(request.params._meta, toolUseMetaKey),
        ...(parent === undefined ? {} : { parent }),
      },
      { ...run, tools: live },
      options,
    );
  });

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
