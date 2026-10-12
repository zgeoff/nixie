import type { SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec } from '@heynixie/sandbox';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import { buildModelGrant } from './build-model-grant';
import { deriveModelSecret } from './derive-model-secret';
import { runConversationStep } from './run-conversation-step';
import type { GuestCommand } from './run-guest-turn';
import type { ConversationRun, ResolvedProfile } from './types';

export interface ConversationRunnerOptions {
  readonly context: TasksContext;

  // the conversation role's profile, read once at start: a role change reaches the conversation
  // at its next start
  readonly profile: ResolvedProfile;
  readonly sandboxes: SandboxAdapter;
  readonly tools: Pick<ToolEndpoint, 'startRun'>;

  // the conversation's tool list, which its endpoint serves
  readonly toolNames: readonly string[];
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;

  // the persona in force, read at each turn so a new seed reaches the next turn
  readonly getSystemPrompt: () => string;
  readonly readTurnNote?: NonNullable<ConversationRun['readTurnNote']>;
}

export interface ConversationRunner {
  readonly runStep: RunStep;
  readonly stop: () => Promise<void>;
}

// Starts the conversation's runner on its role's profile: it stores the profile's credential with
// the sandbox backend, keeps the conversation's long-lived sandbox when its spec still matches and
// replaces it otherwise, and opens the conversation's tool endpoint.
export async function startConversationRunner(
  options: ConversationRunnerOptions,
): Promise<ConversationRunner> {
  const secret = deriveModelSecret(options.profile);

  await options.sandboxes.addSecret(secret);

  const sandbox = await setupConversationSandbox(options, buildModelGrant(secret));
  const model: ToolRunModel = {
    model: options.profile.profile.model,
    profile: options.profile.profile.id,
  };
  const endpoint = await options.tools.startRun({
    runID: conversationTaskID,
    thread: conversationTaskID,
    tools: options.toolNames,
    model,
  });

  return {
    runStep: (input) => {
      if (input.taskID !== conversationTaskID) {
        return Promise.reject(
          new Error(`the conversation runner runs the conversation only, not ${input.taskID}`),
        );
      }
      return runConversationStep({ ...options, sandbox, endpoint, model }, input);
    },
    stop: () => endpoint.stop(),
  };
}

// the sandbox's owner is the conversation, whose run never ends, so the sandbox outlives each step
async function setupConversationSandbox(
  options: ConversationRunnerOptions,
  grant: ReturnType<typeof buildModelGrant>,
): ReturnType<SandboxAdapter['create']> {
  const spec = buildSandboxSpec({
    kind: 'conversation',
    image: options.image,
    owner: conversationTaskID,
    limits: options.limits,
    modelGrant: grant,
  });
  const existing = await options.sandboxes.list(conversationTaskID);
  const kept = existing.find((sandbox) => Bun.deepEquals(sandbox.spec, spec));

  await Promise.all(
    existing.filter((sandbox) => sandbox !== kept).map((sandbox) => sandbox.destroy()),
  );
  return kept ?? options.sandboxes.create(spec);
}
