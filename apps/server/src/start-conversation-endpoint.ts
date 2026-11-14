import { join } from 'node:path';
import type { SearchProvider } from '@heynixie/connectors';
import { buildSearchTool, buildTimeTool, readMessageTimeZone } from '@heynixie/connectors';
import type { DefinitionsInForce } from '@heynixie/definitions';
import { checkPromptProposal } from '@heynixie/definitions';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadImageTool, buildLogReadTool } from '@heynixie/memory';
import { buildPromptReadTool, buildPromptWriteTool } from '@heynixie/prompts';
import { buildSilentEndTool } from '@heynixie/sessions';
import type { SkillVendorContext } from '@heynixie/skills';
import { buildTaskMessageTool, buildTaskStartTool, buildTasksListTool } from '@heynixie/tasks';
import type { ActionQueue, ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import { buildContactTool } from './build-contact-tool';
import { buildConversationMemoryTools } from './build-conversation-memory-tools';
import { buildConversationSkillTools } from './build-conversation-skill-tools';
import { buildConversationTools } from './build-conversation-tools';
import { buildTaskMessaging } from './build-task-messaging';
import { buildTaskStartBounds } from './build-task-start-bounds';
import type { DecisionPointFactory } from './make-server-decisions';
import type { ServerParts } from './types';

interface ConversationSearch {
  readonly provider: SearchProvider;
  readonly dailyCallCap: number;
}

export interface ConversationEndpointTools {
  readonly webFetch: ToolDefinition;
  readonly search: ConversationSearch | null;

  readonly testTools: readonly ToolDefinition[];

  readonly queue: ActionQueue;
  readonly makeDecide: DecisionPointFactory;
  readonly readStore: () => MemoryToolStore | null;

  readonly readInForce: () => DefinitionsInForce | null;
  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  readonly vendor: SkillVendorContext | null;

  readonly isPromptExported: boolean;
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

  const logReaders = [
    buildLogReadTool(options.context.log),
    buildLogReadImageTool(options.context.log),
  ];

  const skills = buildConversationSkillTools(
    {
      log: options.context.log,
      clock: options.context.clock,
      readInForce: tools.readInForce,
      refreshDefinitions: tools.refreshDefinitions,
    },
    tools.vendor,
  );

  const promptContext = {
    log: options.context.log,
    readInForce: tools.readInForce,
    checkProposal: checkPromptProposal,
  };

  // An approved override reaches the definitions only through the export's pull request, so
  // without the export the model gets no tool to propose one.
  const prompts = tools.isPromptExported
    ? [buildPromptReadTool(promptContext), buildPromptWriteTool(promptContext)]
    : [buildPromptReadTool(promptContext)];

  const messaging = buildTaskMessaging(options.config);

  const memory = {
    readStore: tools.readStore,
    clock: options.context.clock,
    ownerName: options.config.owner.name,
    agentName: options.config.agent.names[0] ?? null,
    defaultZone: options.config.time.default_zone,
  };

  // A started task's thread has no skill list, so a skill tool would refuse its every call.
  const bounds = buildTaskStartBounds(
    options.config.models,
    buildConversationMemoryTools(memory),
    skills,
  );

  const tasks = [
    buildTasksListTool(options.context, messaging),
    buildTaskMessageTool(options.context, messaging),
    buildTaskStartTool(options.context, messaging, bounds),
  ];

  const search =
    tools.search === null
      ? []
      : [
          buildSearchTool(tools.search.provider, {
            log: options.context.log,
            clock: options.context.clock,
            dailyCallCap: tools.search.dailyCallCap,
            timeZone: options.config.time.default_zone,
          }),
        ];

  const definitions = [
    ...buildConversationTools(
      { webFetch: tools.webFetch, time, logReaders, skills, prompts, tasks },
      memory,
    ),
    ...search,
    buildContactTool(options.context, tools.refreshDefinitions),
    buildSilentEndTool(messaging),
  ];

  const registry = buildToolRegistry([...definitions, ...tools.testTools]);

  const endpoint = await startToolEndpoint({
    socketDir: join(options.config.server.dataDir, 'run', 'tools'),
    registry,
    decide: tools.makeDecide((name) => registry.findTool(name)?.definition.declaration ?? null),
    log: options.context.log,
    definitions: options.context.definitions,
    queue: tools.queue,
  });

  await options.cleanup.defer(() => endpoint.stop());

  return { endpoint, definitions: [...definitions, ...tools.testTools] };
}
