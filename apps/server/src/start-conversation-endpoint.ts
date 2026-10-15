import { join } from 'node:path';
import { buildTimeTool, findMessageTimeZone } from '@heynixie/connectors';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadTool } from '@heynixie/memory';
import { makeDecisionPoint } from '@heynixie/policy';
import type { ActionQueue, ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildConversationTools } from './build-conversation-tools';
import type { ToolsOptions } from './start-tools';

export interface ConversationEndpointTools {
  readonly webFetch: ToolDefinition;

  // the queue an allowed queued call goes to, which no conversation tool reaches while each runs
  // direct
  readonly queue: ActionQueue;
  readonly readStore: () => MemoryToolStore | null;
}

export interface ConversationEndpoint {
  readonly endpoint: ToolEndpoint;
  readonly definitions: readonly ToolDefinition[];
}

// Starts the tool endpoint over the conversation's tools, the web fetch tool, the time tool, the log
// reader and the memory tools, and stops it on cleanup. The registry is fixed here, so the memory
// tools reach the store through readStore.
export async function startConversationEndpoint(
  options: ToolsOptions,
  tools: ConversationEndpointTools,
): Promise<ConversationEndpoint> {
  const time = buildTimeTool({
    clock: options.context.clock,
    findTimeZone: () => findMessageTimeZone(options.context.log),
    defaultZone: options.config.time.default_zone,
  });

  const logRead = buildLogReadTool(options.context.log);

  const definitions = buildConversationTools(
    { webFetch: tools.webFetch, time, logRead },
    {
      readStore: tools.readStore,
      clock: options.context.clock,
      ownerName: options.config.owner.name,
      agentName: options.config.agent.names[0] ?? null,
      defaultZone: options.config.time.default_zone,
    },
  );

  const registry = buildToolRegistry(definitions);

  const endpoint = await startToolEndpoint({
    socketDir: join(options.config.server.dataDir, 'run', 'tools'),
    registry,
    decide: makeDecisionPoint({
      findDeclaration: (name) => registry.findTool(name)?.definition.declaration ?? null,
    }),
    log: options.context.log,
    definitions: options.context.definitions,
    queue: tools.queue,
  });

  await options.cleanup.defer(() => endpoint.stop());

  return { endpoint, definitions };
}
