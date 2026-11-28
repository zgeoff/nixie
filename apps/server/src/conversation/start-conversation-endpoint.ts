import { join } from 'node:path';
import type { ErasureStuckPort } from '@heynixie/api';
import { buildProposalCoreDeps } from '@heynixie/api';
import type { ActionConnector, RenderSandbox } from '@heynixie/connectors';
import {
  buildImageTools,
  buildSearchTool,
  buildTimeTool,
  handoverToolNames,
  readMessageTimeZone,
} from '@heynixie/connectors';
import type { DefinitionsContext, DefinitionsInForce } from '@heynixie/definitions';
import {
  buildTaskDefineTool,
  buildTaskUndefineTool,
  buildTasksDefinitionsTool,
  checkPromptProposal,
} from '@heynixie/definitions';
import type { DeviceStreams, DeviceToolOptions } from '@heynixie/devices';
import {
  buildDevicePackageConnector,
  buildDeviceTools,
  restoreDevicePackages,
  startPageFetches,
} from '@heynixie/devices';
import { toErrorFields } from '@heynixie/logger';
import { buildMcpServersTool, findServerIDClash } from '@heynixie/mcp';
import type { Mcp } from '@heynixie/mcp';
import type { ConversationMemoryStore } from '@heynixie/memory';
import {
  buildLogReadImageTool,
  buildLogReadTool,
  buildRelatedMemoryLookup,
} from '@heynixie/memory';
import type { NotebookToolStore } from '@heynixie/notebook';
import { buildNotebookTools } from '@heynixie/notebook';
import type { PlaceContext } from '@heynixie/policy';
import { buildPromptReadTool, buildPromptWriteTool } from '@heynixie/prompts';
import {
  buildReminderCancelTool,
  buildReminderSetTool,
  buildReminderSkipTool,
  buildReminderSnoozeTool,
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
import type {
  ActionQueue,
  ConnectionChoice,
  ToolDefinition,
  ToolEndpoint,
  ToolRegistry,
  ToolSource,
} from '@heynixie/tools';
import { buildToolRegistry, findToolDeclaration, startToolEndpoint } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { readActionCallSource } from '../action/read-action-call-source';
import { makeReadCallSession } from '../call/make-read-call-session';
import { buildContactTool } from '../cli/build-contact-tool';
import { buildProposalConfig } from '../deployment/build-proposal-config';
import { buildForgetRetryTool } from '../forget/build-forget-retry-tool';
import { buildForgetStuckTool } from '../forget/build-forget-stuck-tool';
import { buildPlacesListTool } from '../place/build-places-list-tool';
import { buildPlacesNarrowTool } from '../place/build-places-narrow-tool';
import { buildPlacesProposeTool } from '../place/build-places-propose-tool';
import { buildMandateTool } from '../rule/build-mandate-tool';
import { buildRulesListTool } from '../rule/build-rules-list-tool';
import { makeReadZone } from '../server/make-read-zone';
import { buildTaskStartBounds } from '../task/build-task-start-bounds';
import type { BuildCodingStart, ServerParts } from '../types';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import type { DecisionPointFactory } from '../utils/make-server-decisions';
import { buildConversationMemoryTools } from './build-conversation-memory-tools';
import { buildConversationSkillTools } from './build-conversation-skill-tools';
import { buildConversationTools } from './build-conversation-tools';
import type { DeviceFetchingOptions } from './make-device-fetching';
import { makeDeviceFetching } from './make-device-fetching';
import type { ConversationImages, ConversationSearch } from './types';

export interface ConversationEndpointTools {
  readonly webFetch: ToolDefinition;
  readonly computer: readonly ToolDefinition[];

  // null when the sandbox manifest holds no render image, so a preview has no picture
  readonly render: RenderSandbox | null;

  // the tools on coding sessions, none without a coding runner
  readonly coding: readonly ToolDefinition[];

  // builds coding.start, which starts a coding task; null without a coding runner
  readonly buildCodingStart: BuildCodingStart | null;

  // the tools on the assistant's own mailbox, none without a mailbox
  readonly mail: readonly ToolDefinition[];

  // the tools on the assistant's own phone, none without a phone
  readonly phone: readonly ToolDefinition[];

  // the tools of the Google connector, which each run leaves out while its scopes are missing
  readonly google: readonly ToolDefinition[];
  readonly codeRun: ToolDefinition | null;
  readonly fileSend: ToolDefinition | null;
  readonly forget: ToolDefinition;
  readonly readErasure: () => ErasureStuckPort | null;
  readonly search: ConversationSearch | null;

  // absent when the deployment sets no images block
  readonly images: ConversationImages | null;

  // the open streams of each device, which the API's device calls share; null while the devices
  // feature is off
  readonly deviceStreams: DeviceStreams | null;

  // the fetch sandbox, backoff and registry that device pages reach the web through; null while the
  // devices feature is off
  readonly deviceFetch: Pick<
    DeviceFetchingOptions,
    'fetch' | 'registry' | 'backoff' | 'checkAddress' | 'findSecret' | 'logger'
  > | null;

  // absent when the deployment sets no worker role
  readonly worker: WorkerTool | null;

  readonly testTools: readonly ToolDefinition[];

  // sources of more tools, which join the registry as they start
  readonly toolSources: readonly ToolSource[];

  // the MCP proxy, which `mcp.servers` reads once it starts
  readonly readMcp: () => Mcp | null;

  // the values nixie holds as its own, which every tool result is scanned for
  readonly readOwnValues: () => readonly string[];

  readonly queue: ActionQueue;
  readonly makeDecide: DecisionPointFactory;
  readonly readStore: () => ConversationMemoryStore | null;
  readonly readNotebook: () => NotebookToolStore | null;

  // the tools that a run leaves out of its list; none before the connections start
  readonly readHeldBackTools: () => Promise<readonly string[]>;

  // the connections that are not forgotten; none before the connections start
  readonly readLiveConnections: () => Promise<readonly ConnectionChoice[]>;

  // the short IDs of the connections that hold every scope of each connector tool, by tool name;
  // none before the connections start
  readonly readToolConnections: () => Promise<Readonly<Record<string, readonly string[]>>>;

  readonly readInForce: () => DefinitionsInForce | null;
  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;
  readonly runInForceSeed: () => Promise<void>;

  // the directory's write context, which the places tools read each call; null before the server
  // parts start
  readonly readPlaces: () => PlaceContext | null;

  // null before the server parts start
  readonly readDefinitions: () => DefinitionsContext | null;

  readonly vendor: SkillVendorContext | null;

  readonly isPromptExported: boolean;

  // the tools that only a call's thread holds, which stay out of the conversation's own list
  readonly callTools: readonly ToolDefinition[];
}

export interface ConversationEndpoint {
  readonly endpoint: ToolEndpoint;
  readonly definitions: readonly ToolDefinition[];
  readonly taskBounds: TaskStartBounds;

  // the name of each tool the registry holds, which includes the tools that only a call's thread holds
  readonly readToolNames: () => readonly string[];

  // the action queue's connectors for the queued tools that only the endpoint can build
  readonly connectors: ReadonlyMap<string, ActionConnector>;
}

export async function startConversationEndpoint(
  options: Pick<ServerParts, 'cleanup' | 'config' | 'context' | 'log'>,
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

  const relatedMemory = buildRelatedMemoryLookup(tools.readStore, options.log);

  const skills = buildConversationSkillTools(
    {
      relatedMemory,
      log: options.context.log,
      clock: options.context.clock,
      proposalConfig: buildProposalConfig(options.config),
      readInForce: tools.readInForce,
      refreshDefinitions: tools.refreshDefinitions,
      runInForceSeed: tools.runInForceSeed,
    },
    tools.vendor,
  );

  const promptContext = {
    log: options.context.log,
    clock: options.context.clock,
    proposalConfig: buildProposalConfig(options.config),
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
    proposals: {
      log: options.context.log,
      clock: options.context.clock,
      readMemory: tools.readStore,
      readTaskNames: () => readTaskNames(options.context),
      readCore: () =>
        buildProposalCoreDeps(options.context, {
          readMemory: () => null,
          findPrompts: () => ({
            readInForce: tools.readInForce,
            checkProposal: checkPromptProposal,
          }),
          runInForceSeed: () => Promise.resolve(),
        }),
    },
  };

  const notebook = buildNotebookTools(() => {
    const store = tools.readNotebook();

    if (store === null) {
      throw new Error('a tool call ran before the notebook started');
    }

    return store;
  });

  const definitionToolOptions = {
    relatedMemory,
    readDefinitions: tools.readDefinitions,
    connections: { readUsable: tools.readToolConnections },
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
    relatedMemory,
  };

  const definitionTools = [
    buildTasksDefinitionsTool(definitionToolOptions),
    buildTasksRunsTool(options.context, messaging),
    buildTaskDefineTool(definitionToolOptions),
    buildTaskUndefineTool(definitionToolOptions),
    buildReminderSetTool(reminders),
    buildReminderUpdateTool(reminders),
    buildReminderCancelTool(reminders),
    buildReminderSnoozeTool(reminders),
    buildReminderSkipTool(reminders),
  ];

  const remindersList = buildRemindersListTool(reminders);

  // A started task's thread has no skill list, so a skill tool would refuse its every call. The
  // tools that list or change the task definitions and the tools that change the reminders belong
  // to the conversation alone. A task may hold the tool that lists the reminders.
  const bounds = buildTaskStartBounds(
    options.config.models,
    buildConversationMemoryTools(memory),
    [
      ...skills,
      ...definitionTools,
      ...tools.computer.filter((tool) => handoverToolNames.some((name) => name === tool.name)),
    ],
    options.context.runSettings.reportDefaults,
  );

  const tasks = [
    buildTasksListTool(options.context, messaging),
    buildTaskMessageTool(options.context, messaging),
    buildTaskStartTool(options.context, messaging, bounds, relatedMemory),
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
            priceMicros: tools.search.priceMicros,
            timeZone: options.config.time.default_zone,
          }),
        ];

  const images =
    tools.images === null
      ? []
      : buildImageTools({
          log: options.context.log,
          definitions: options.context.definitions,
          clock: options.context.clock,
          imageLongEdge: options.config.web_fetch.imageLongEdge,
          images: tools.images.config,
          providers: tools.images.providers,
        });

  const registryHolder: { current: ToolRegistry | null } = { current: null };

  const fetching =
    tools.deviceFetch === null
      ? null
      : makeDeviceFetching({
          ...tools.deviceFetch,
          log: options.context.log,
          definitions: options.context.definitions,
          clock: options.context.clock,
          makeDecide: tools.makeDecide,
          findDeclaration: (name) =>
            registryHolder.current === null
              ? null
              : findToolDeclaration(registryHolder.current, name),
        });

  const deviceStreams = tools.deviceStreams;

  const deviceOptions: DeviceToolOptions | null =
    deviceStreams === null || fetching === null
      ? null
      : {
          log: options.context.log,
          definitions: options.context.definitions,
          clock: options.context.clock,
          streams: deviceStreams,
          readCallSession: makeReadCallSession(options.context.log),
          fetching,
          ...(tools.render === null
            ? {}
            : {
                preview: {
                  draw: tools.render.draw,
                  timeZone: options.config.time.default_zone,
                },
              }),
        };

  const devices = deviceOptions === null ? [] : buildDeviceTools(deviceOptions);

  const packageConnector =
    deviceOptions === null
      ? null
      : buildDevicePackageConnector(deviceOptions, (actionID) =>
          readActionCallSource(options.context.log, actionID),
        );

  const worker = tools.worker === null ? [] : [tools.worker.buildTool(bounds)];

  const requirePlaces = (): PlaceContext => {
    const places = tools.readPlaces();

    invariant(places, 'a places tool runs once the server parts start');

    return places;
  };

  const definitions = [
    ...buildConversationTools(
      {
        webFetch: tools.webFetch,
        ...(tools.codeRun === null ? {} : { codeRun: tools.codeRun }),
        ...(tools.fileSend === null ? {} : { fileSend: tools.fileSend }),
        forget: tools.forget,
        time,
        logReaders,
        skills,
        prompts,
        tasks,
      },
      memory,
    ),
    ...notebook,
    ...tools.computer,
    ...tools.coding,
    ...(tools.buildCodingStart === null
      ? []
      : [tools.buildCodingStart({ messaging, bounds, relatedMemory })]),
    ...tools.mail,
    ...tools.phone,
    buildMcpServersTool(tools.readMcp),
    ...tools.google,
    ...search,
    ...images,
    ...devices,
    ...definitionTools,
    remindersList,
    ...worker,
    buildContactTool(options.context, tools.refreshDefinitions),
    buildPlacesProposeTool(requirePlaces),
    buildPlacesNarrowTool(requirePlaces),
    buildPlacesListTool(requirePlaces),
    buildMandateTool({
      context: options.context,
      proposalConfig: buildProposalConfig(options.config),
      maxHours: options.config.policy.mandates.maxHours,
      defaultZone: options.config.time.default_zone,
    }),
    buildRulesListTool(options.context),
    buildForgetStuckTool(tools.readErasure),
    buildForgetRetryTool(tools.readErasure),
    buildSilentEndTool(messaging),
    buildTaskReportTool(options.context),
  ];

  const clash = findServerIDClash(
    Object.keys(options.config.mcp.servers),
    [...definitions, ...tools.callTools, ...tools.testTools].map((definition) => definition.name),
  );

  if (clash !== null) {
    throw new Error(
      `the mcp server ID ${clash.serverID} is the first segment of the tool ${clash.tool}; rename the server`,
    );
  }

  const registry = buildToolRegistry(
    [...definitions, ...tools.callTools, ...tools.testTools],
    tools.toolSources,
  );

  registryHolder.current = registry;

  const endpoint = await startToolEndpoint({
    socketDir: join(options.config.server.dataDir, 'run', 'tools'),
    registry,
    decide: tools.makeDecide((name) => findToolDeclaration(registry, name)),
    log: options.context.log,
    logger: options.log,
    definitions: options.context.definitions,
    queue: tools.queue,
    readOwnValues: tools.readOwnValues,
    readHeldBackTools: tools.readHeldBackTools,
    readLiveConnections: tools.readLiveConnections,
    proposalConfig: buildProposalConfig(options.config),
    retry: options.config.tools.retry,
    ...(options.context.budgets === undefined ? {} : { budgets: options.context.budgets }),
  });

  await options.cleanup.defer(() => endpoint.stop());

  // the fetches that device pages declare run while the tools are up, and an approved package that
  // lost its files comes back from the registry
  if (deviceStreams !== null && fetching !== null) {
    const stopFetches = startPageFetches({
      log: options.context.log,
      clock: options.context.clock,
      streams: deviceStreams,
      fetching,
      onFailure: (error) => {
        options.log('devices.fetch_failed', toErrorFields(error), 'error');
      },
    });

    await options.cleanup.defer(stopFetches);

    void restoreDevicePackages({
      log: options.context.log,
      fetching,
      onFailure: (error) => {
        options.log('devices.package_restore_failed', toErrorFields(error), 'error');
      },
    });
  }

  const connectorEntries =
    packageConnector === null ? [] : [['device.addPackage', packageConnector] as const];

  return {
    endpoint,
    definitions: [...definitions, ...tools.testTools],
    taskBounds: bounds,
    readToolNames: () => registry.toolNames,
    connectors: new Map(connectorEntries),
  };
}
