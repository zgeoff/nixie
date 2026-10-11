import { join } from 'node:path';
import type {
  ConversationRunner,
  GuestCommand,
  ModelSecrets,
  ModelsConfig,
} from '@heynixie/models';
import {
  resolveModelCredentials,
  resolveRoleProfile,
  startConversationRunner,
} from '@heynixie/models';
import type { SandboxAdapter } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint } from '@heynixie/tools';

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
}

// Starts the conversation on the conversation role's profile. Every profile's credential resolves
// first, so a reference the secrets file lacks stops nixie at start.
export function startConversation(options: ConversationOptions): Promise<ConversationRunner> {
  const credentials = resolveModelCredentials(options.models, options.secrets);
  const profile = resolveRoleProfile(options.models, 'conversation');
  const resolved = credentials[profile.id];

  if (resolved === undefined) {
    throw new Error(`the conversation profile ${profile.id} has no credential`);
  }
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
  });
}

// The conversation image runs its guest from /app as the user nixie. A test build's process
// double runs the guest's source from the workspace with the test's own Bun, under the sandbox's
// own directory as its home.
function buildGuestCommand(): GuestCommand {
  if (NIXIE_TEST_BUILD) {
    return {
      argv: [process.execPath, join(import.meta.dir, '../../../guests/conversation/src/main.ts')],
      env: {},
    };
  }
  return { argv: ['bun', '/app/guests/conversation/src/main.ts'], env: { HOME: '/home/nixie' } };
}
