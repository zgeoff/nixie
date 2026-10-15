import type { ModelSecrets, ModelsConfig } from '@heynixie/models';
import { resolveModelCredentials, resolveRoleProfile } from '@heynixie/models';
import type { Logger } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type {
  CompactionSettings,
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRunner,
  ConversationRunnerOptions,
} from '@heynixie/sessions';
import { startConversationRunner } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildGuestCommand } from './build-guest-command';

export interface ConversationOptions {
  readonly context: TasksContext;
  readonly models: ModelsConfig;
  readonly secrets: ModelSecrets;
  readonly sandboxes: SandboxAdapter;
  readonly tools: Pick<ToolEndpoint, 'startRun'>;
  readonly toolNames: readonly string[];

  // the conversation image's name in impd, from the sandbox manifest
  readonly image: string;

  // the persona in force, read at each turn
  readonly getSystemPrompt: () => string;

  // the note of memory changes made outside the conversation, read before each turn
  readonly readTurnNote?: ConversationRunnerOptions['readTurnNote'];

  // the lines of a new session's status, in order
  readonly status?: ConversationRunnerOptions['status'];

  // the memory store, read at each turn, which starts after the conversation
  readonly memory: () => ConversationMemory;
  readonly memorySettings?: Partial<ConversationMemorySettings>;

  // when the session compacts, from the deployment configuration's compaction section
  readonly compaction?: CompactionSettings;

  // the IANA zone your message renders its send time in when it carries no zone of its own
  readonly defaultZone?: string;

  // the server's log, which takes a warning when a replaced sandbox's session does not carry over
  readonly log: Logger;
}

// Starts the conversation on the conversation role's profile. Every profile's credential resolves
// first, so a reference the secrets file lacks stops nixie at start.
export function startConversation(options: ConversationOptions): Promise<ConversationRunner> {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'conversation');
  const resolved = credentials[profile.id];

  // the credentials resolve for every profile, or resolveModelCredentials throws first
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
    getSystemPrompt: options.getSystemPrompt,
    ...(options.readTurnNote === undefined ? {} : { readTurnNote: options.readTurnNote }),
    ...(options.status === undefined ? {} : { status: options.status }),
    memory: options.memory,
    ...(options.memorySettings === undefined ? {} : { memorySettings: options.memorySettings }),
    ...(options.compaction === undefined ? {} : { compaction: options.compaction }),
    ...(options.defaultZone === undefined ? {} : { defaultZone: options.defaultZone }),
    log: options.log,
  });
}
