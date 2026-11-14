import type { CompactionSettings } from '@heynixie/compaction';
import type { Logger } from '@heynixie/logger';
import type { ModelSecrets, ModelsConfig } from '@heynixie/models';
import { bindHarness, resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRunner,
  ConversationRunnerOptions,
} from '@heynixie/sessions';
import { buildGuestCommand, getHarnessImage, startConversationRunner } from '@heynixie/sessions';
import type { TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import invariant from 'tiny-invariant';

export interface ConversationOptions {
  readonly context: TasksContext;
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;
  readonly tools: Pick<ToolEndpoint, 'startRun'>;
  readonly toolNames: readonly string[];

  readonly images: Readonly<Record<string, string>>;

  readonly getDefinitions: ConversationRunnerOptions['getDefinitions'];

  readonly readTurnNote?: ConversationRunnerOptions['readTurnNote'];

  readonly loadOrPinSkillCatalog?: ConversationRunnerOptions['loadOrPinSkillCatalog'];

  readonly status?: ConversationRunnerOptions['status'];

  readonly memory: () => ConversationMemory;
  readonly memorySettings?: Partial<ConversationMemorySettings>;

  readonly compaction?: CompactionSettings;

  readonly defaultZone?: string;

  readonly messaging?: TaskMessaging;

  readonly turnInputs?: ConversationRunnerOptions['turnInputs'];

  readonly log: Logger;
}

export function startConversation(options: ConversationOptions): Promise<ConversationRunner> {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'conversation');
  const resolved = credentials[profile.id];

  invariant(resolved, `the conversation profile ${profile.id} was never resolved`);

  const harness = bindHarness(profile);

  return startConversationRunner({
    context: options.context,
    profile: resolved,
    harness,
    sandboxes: options.sandboxes,
    tools: options.tools,
    toolNames: options.toolNames,
    image: getHarnessImage(options.images, harness.imageKey),
    limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
    command: buildGuestCommand(options.sandboxes, harness.guest),
    getDefinitions: options.getDefinitions,
    ...(options.readTurnNote === undefined ? {} : { readTurnNote: options.readTurnNote }),
    ...(options.loadOrPinSkillCatalog === undefined
      ? {}
      : { loadOrPinSkillCatalog: options.loadOrPinSkillCatalog }),
    ...(options.status === undefined ? {} : { status: options.status }),
    memory: options.memory,
    ...(options.memorySettings === undefined ? {} : { memorySettings: options.memorySettings }),
    ...(options.compaction === undefined ? {} : { compaction: options.compaction }),
    ...(options.defaultZone === undefined ? {} : { defaultZone: options.defaultZone }),
    ...(options.messaging === undefined ? {} : { messaging: options.messaging }),
    ...(options.turnInputs === undefined ? {} : { turnInputs: options.turnInputs }),
    log: options.log,
  });
}
