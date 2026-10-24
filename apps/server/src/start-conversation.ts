import type { CompactionSettings } from '@heynixie/compaction';
import type { Logger } from '@heynixie/logger';
import type { ModelSecrets, ModelsConfig } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRunner,
  ConversationRunnerOptions,
} from '@heynixie/sessions';
import { buildGuestCommand, startConversationRunner } from '@heynixie/sessions';
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

  readonly image: string;

  readonly getDefinitions: ConversationRunnerOptions['getDefinitions'];

  readonly readTurnNote?: ConversationRunnerOptions['readTurnNote'];

  readonly loadOrPinSkillCatalog?: ConversationRunnerOptions['loadOrPinSkillCatalog'];

  readonly status?: ConversationRunnerOptions['status'];

  readonly memory: () => ConversationMemory;
  readonly memorySettings?: Partial<ConversationMemorySettings>;

  readonly compaction?: CompactionSettings;

  readonly defaultZone?: string;

  readonly messaging?: TaskMessaging;

  readonly log: Logger;
}

export function startConversation(options: ConversationOptions): Promise<ConversationRunner> {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'conversation');
  const resolved = credentials[profile.id];

  invariant(resolved, `the conversation profile ${profile.id} has no credential`);

  return startConversationRunner({
    context: options.context,
    profile: resolved,
    sandboxes: options.sandboxes,
    tools: options.tools,
    toolNames: options.toolNames,
    image: options.image,
    limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
    command: buildGuestCommand(options.sandboxes),
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
    log: options.log,
  });
}
