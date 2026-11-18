import { join } from 'node:path';
import type { SearchProvider } from '@heynixie/connectors';
import { buildSearchTool, buildTimeTool, readMessageTimeZone } from '@heynixie/connectors';
import type { DefinitionsContext, DefinitionsInForce } from '@heynixie/definitions';
import {
  buildTaskDefineTool,
  buildTaskUndefineTool,
  buildTasksDefinitionsTool,
  checkPromptProposal,
} from '@heynixie/definitions';
import type { MemoryToolStore } from '@heynixie/memory';
import { buildLogReadImageTool, buildLogReadTool } from '@heynixie/memory';
import { buildPromptReadTool, buildPromptWriteTool } from '@heynixie/prompts';
import {
  buildReminderCancelTool,
  buildReminderSetTool,
  buildReminderUpdateTool,
  buildRemindersListTool,
} from '@heynixie/reminders';
import { buildSilentEndTool } from '@heynixie/sessions';
import type { WorkerTool } from '@heynixie/sessions';
import type { SkillVendorContext } from '@heynixie/skills';
import type { TaskStartBounds } from '@heynixie/tasks';
import {
  buildTaskCloseTool,
  buildTaskMessageTool,
  buildTaskReportTool,
  buildTaskStartTool,
  buildTasksListTool,
  buildTasksRunsTool,
  readTaskNames,
} from '@heynixie/tasks';
import type { ActionQueue, ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, findToolDeclaration, startToolEndpoint } from '@heynixie/tools';
import { buildContactTool } from '../cli/build-contact-tool';
import { buildMandateTool } from '../rule/build-mandate-tool';
import { makeReadZone } from '../server/make-read-zone';
import { buildTaskStartBounds } from '../task/build-task-start-bounds';
import type { ServerParts } from '../types';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import type { DecisionPointFactory } from '../utils/make-server-decisions';
import { buildConversationMemoryTools } from './build-conversation-memory-tools';
import { buildConversationSkillTools } from './build-conversation-skill-tools';
import { buildConversationTools } from './build-conversation-tools';

interface ConversationSearch {
  readonly provider: SearchProvider;
  readonly dailyCallCap: number;
}

export interface ConversationEndpointTools {
  readonly webFetch: ToolDefinition;
  readonly codeRun: ToolDefinition;
  readonly fileSend: ToolDefinition;
  readonly forget: ToolDefinition;
  readonly search: ConversationSearch | null;

  // absent when the deployment sets no worker role
  readonly worker: WorkerTool | null;

  readonly testTools: readonly ToolDefinition[];

  readonly queue: ActionQueue;
  readonly makeDecide: DecisionPointFactory;
  readonly readStore: () => MemoryToolStore | null;

  readonly readInForce: () => DefinitionsInForce | null;
  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  // null before the server parts start
  readonly readDefinitions: () => DefinitionsContext | null;

  readonly vendor: SkillVendorContext | null;

  readonly isPromptExported: boolean;
}

export interface ConversationEndpoint {
  readonly endpoint: ToolEndpoint;
  readonly definitions: readonly ToolDefinition[];
  readonly taskBounds: TaskStartBounds;
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
    buildLogReadTool(options.context.log, () => readTaskNames(options.context)),
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
    defaultZone: options.config.time.default_zone,
  };

  const definitionToolOptions = {
    readDefinitions: tools.readDefinitions,
    readZone: makeReadZone(
      options.context.log.writer,
      options.context.log.writer.db,
      options.config.time.default_zone,
    ),
  };

  const reminders = {
    log: options.context.log,
    definitions: options.context.definitions,
    readZone: definitionToolOptions.readZone,
    minGapMinutes: options.config.reminders.min_gap_minutes,
  };

  const definitionTools = [
    buildTasksDefinitionsTool(definitionToolOptions),
    buildTasksRunsTool(options.context, messaging),
    buildTaskDefineTool(definitionToolOptions),
    buildTaskUndefineTool(definitionToolOptions),
    buildRemindersListTool(reminders),
    buildReminderSetTool(reminders),
    buildReminderUpdateTool(reminders),
    buildReminderCancelTool(reminders),
  ];

  // A started task's thread has no skill list, so a skill tool would refuse its every call. The
  // tools that list or change the task definitions and the reminders belong to the conversation alone.
  const bounds = buildTaskStartBounds(
    options.config.models,
    buildConversationMemoryTools(memory),
    [...skills, ...definitionTools],
    options.context.runSettings.reportDefaults,
  );

  const tasks = [
    buildTasksListTool(options.context, messaging),
    buildTaskMessageTool(options.context, messaging),
    buildTaskStartTool(options.context, messaging, bounds),
    buildTaskCloseTool(options.context, messaging),
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

  const worker = tools.worker === null ? [] : [tools.worker.buildTool(bounds)];

  const definitions = [
    ...buildConversationTools(
      {
        webFetch: tools.webFetch,
        codeRun: tools.codeRun,
        fileSend: tools.fileSend,
        forget: tools.forget,
        time,
        logReaders,
        skills,
        prompts,
        tasks,
      },
      memory,
    ),
    ...search,
    ...definitionTools,
    ...worker,
    buildContactTool(options.context, tools.refreshDefinitions),
    buildMandateTool({
      context: options.context,
      maxHours: options.config.policy.mandates.maxHours,
      defaultZone: options.config.time.default_zone,
    }),
    buildSilentEndTool(messaging),
    buildTaskReportTool(options.context),
  ];

  const registry = buildToolRegistry([...definitions, ...tools.testTools]);

  const endpoint = await startToolEndpoint({
    socketDir: join(options.config.server.dataDir, 'run', 'tools'),
    registry,
    decide: tools.makeDecide((name) => findToolDeclaration(registry, name)),
    log: options.context.log,
    definitions: options.context.definitions,
    queue: tools.queue,
    ...(options.context.budgets === undefined ? {} : { budgets: options.context.budgets }),
  });

  await options.cleanup.defer(() => endpoint.stop());

  return { endpoint, definitions: [...definitions, ...tools.testTools], taskBounds: bounds };
}
