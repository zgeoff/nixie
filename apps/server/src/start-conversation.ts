import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRunner,
  ConversationRunnerOptions,
  ModelSecrets,
  ModelsConfig,
} from '@heynixie/models';
import {
  resolveModelCredentials,
  resolveRoleProfile,
  startConversationRunner,
} from '@heynixie/models';
import type { Logger } from '@heynixie/ops';
import type { SandboxAdapter } from '@heynixie/sandbox';
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

  // the memory store, read at each turn, which starts after the conversation
  readonly memory: () => ConversationMemory;
  readonly memorySettings?: Partial<ConversationMemorySettings>;

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
    command: buildGuestCommand(),
    getSystemPrompt: options.getSystemPrompt,
    ...(options.readTurnNote === undefined ? {} : { readTurnNote: options.readTurnNote }),
    memory: options.memory,
    ...(options.memorySettings === undefined ? {} : { memorySettings: options.memorySettings }),
    log: options.log,
  });
}
