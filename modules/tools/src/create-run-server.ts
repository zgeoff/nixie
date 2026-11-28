import type { JSONObject } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { Server } from '@modelcontextprotocol/server';
import type { ToolCallOptions } from './call-record/tool-call-options';
import { collectReachableTools } from './connection/collect-reachable-tools';
import { findSoleConnection } from './connection/find-sole-connection';
import { findToolPins } from './connection/find-tool-pins';
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
  const readLiveTools = async () => {
    const heldBackNames = await options.readHeldBackTools?.();

    const heldBack = new Set(heldBackNames);

    const liveConnections = await options.readLiveConnections?.();

    const connections = liveConnections ?? null;

    return {
      names: collectReachableTools(
        run.tools.filter((name) => !heldBack.has(name)),
        run.connectionPins,
        connections,
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

      const sole = findSoleConnection(findToolPins(run.connectionPins, name), live.connections);

      return [
        {
          name,
          description: registered.definition.description,
          inputSchema: {
            ...(sole === null
              ? registered.definition.input
              : omitConnectionArgument(registered.definition.input)),
            type: 'object' as const,
          },
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

// A tool pinned to one connection lists no connection argument, because the call binds to that one.
function omitConnectionArgument(input: JSONObject): JSONObject {
  const { properties, required, ...rest } = input;

  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    return input;
  }

  const kept = Object.fromEntries(
    Object.entries(properties).filter(([name]) => name !== 'connection'),
  );

  return {
    ...rest,
    properties: kept,
    ...(Array.isArray(required)
      ? { required: required.filter((name) => name !== 'connection') }
      : {}),
  };
}

// The guest sends the model's tool-use ID on every tools/call, so the call's record joins its turn.
function findToolUseID(
  meta: Readonly<Record<string, unknown>> | undefined,
  key: string | null,
): string | null {
  const toolUseID = key === null ? undefined : meta?.[key];

  return typeof toolUseID === 'string' ? toolUseID : null;
}
