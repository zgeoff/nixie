import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { Server } from '@modelcontextprotocol/server';
import type { ToolCallOptions } from './call-record/tool-call-options';
import { buildListedInput } from './connection/build-listed-input';
import { collectReachableConnections } from './connection/collect-reachable-connections';
import { collectReachableTools } from './connection/collect-reachable-tools';
import { findToolPins } from './connection/find-tool-pins';
import { runToolCall } from './run-tool-call';
import { collectHeldToolNames } from './tool-name/collect-held-tool-names';
import type { GuestToolRun } from './types';

// oxlint-disable-next-line typescript/no-deprecated -- McpServer answers a call to a tool it does not list itself, so the scope stage would never see it
export function createRunServer(guestRun: GuestToolRun, options: ToolCallOptions): Server {
  const { toolUseMetaKey, parent, ...run } = guestRun;

  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  // The run's tools at the moment of the request: each listed name resolved against the registry as
  // it stands, minus the ones held back. The list and the scope check of a call read the same
  // names, so a tool a server exposes after the run starts is in both.
  const readLiveTools = async () => {
    const heldBackNames = await options.readHeldBackTools?.();

    const heldBack = new Set(heldBackNames);

    const liveConnections = await options.readLiveConnections?.();

    const connections = liveConnections ?? null;

    const liveIDs =
      connections === null ? null : new Set(connections.map((choice) => choice.connection));

    return {
      names: collectReachableTools(
        collectHeldToolNames(
          run.tools,
          options.registry.toolNames,
          options.registry.serverIDs,
        ).held.filter((name) => !heldBack.has(name)),
        run.connectionPins,
        liveIDs,
      ),
      connections,
    };
  };

  server.setRequestHandler('tools/list', async () => {
    const live = await readLiveTools();

    const tools = live.names.flatMap((name) => {
      const registered = options.registry.findTool(name);

      if (registered === null) {
        return [];
      }

      const pinned = findToolPins(run.connectionPins, name);

      const input =
        pinned === undefined || live.connections === null
          ? registered.definition.input
          : buildListedInput(
              registered.definition.input,
              collectReachableConnections(pinned, live.connections),
            );

      return [
        {
          name,
          description: registered.definition.description,
          inputSchema: { ...input, type: 'object' as const },
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
      { ...run, tools: live.names },
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
