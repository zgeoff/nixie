import { join } from 'node:path';
import { buildTimeTool, readMessageTimeZone } from '@heynixie/connectors';
import type { DefinitionsInForce } from '@heynixie/definitions';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadTool } from '@heynixie/memory';
import { makeDecisionPoint } from '@heynixie/policy';
import type { SkillVendorContext } from '@heynixie/skills';
import type { ActionQueue, ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildConversationSkillTools } from './build-conversation-skill-tools';
import { buildConversationTools } from './build-conversation-tools';
import type { ServerParts } from './types';

export interface ConversationEndpointTools {
  readonly webFetch: ToolDefinition;

  readonly testTools: readonly ToolDefinition[];

  readonly queue: ActionQueue;
  readonly readStore: () => MemoryToolStore | null;

  readonly readInForce: () => DefinitionsInForce | null;
  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  readonly vendor: SkillVendorContext | null;
}

export interface ConversationEndpoint {
  readonly endpoint: ToolEndpoint;
  readonly definitions: readonly ToolDefinition[];
}

export async function startConversationEndpoint(
  options: Pick<ServerParts, 'cleanup' | 'config' | 'context'>,
  tools: ConversationEndpointTools,
): Promise<ConversationEndpoint> {
  const time = buildTimeTool({
    clock: options.context.clock,
    findTimeZone: () => readMessageTimeZone(options.context.log),
    defaultZone: options.config.time.default_zone,
  });

  const logRead = buildLogReadTool(options.context.log);

  const skills = buildConversationSkillTools(
    {
      log: options.context.log,
      clock: options.context.clock,
      readInForce: tools.readInForce,
      refreshDefinitions: tools.refreshDefinitions,
    },
    tools.vendor,
  );

  const definitions = buildConversationTools(
    { webFetch: tools.webFetch, time, logRead, skills },
    {
      readStore: tools.readStore,
      clock: options.context.clock,
      ownerName: options.config.owner.name,
      agentName: options.config.agent.names[0] ?? null,
      defaultZone: options.config.time.default_zone,
    },
  );

  const registry = buildToolRegistry([...definitions, ...tools.testTools]);

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

  return { endpoint, definitions: [...definitions, ...tools.testTools] };
}
