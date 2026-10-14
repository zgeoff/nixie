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
  readonly readStore: () => MemoryToolStore | null;
}

export interface ConversationEndpoint {
  readonly endpoint: ToolEndpoint;
  readonly definitions: readonly ToolDefinition[];
}

// Starts the tool endpoint over the conversation's tools, the web fetch tool, the time tool, the log
// reader and the memory tools, and stops it on cleanup. The registry is fixed here, so the memory tools reach the store through
// readStore.
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
    queue: refusingQueue,
  });

  await options.cleanup.defer(() => endpoint.stop());
  return { endpoint, definitions };
}

// No tool in a slice 1 release runs queued: the memory, log and time tools declare note and read and run
// direct, and the read-only rule denies every call with an effect outside nixie before it reaches
// the queue.
const refusingQueue: ActionQueue = {
  enqueue: () => Promise.reject(new Error('no tool in this build runs queued')),
  waitForOutcome: () => Promise.resolve(null),
};
