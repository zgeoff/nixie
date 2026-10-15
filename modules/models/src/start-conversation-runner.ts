import type { RunStep, TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import { buildDefaultStatus } from './build-default-status';
import { deriveModelSecret } from './derive-model-secret';
import { makeSessionGuard } from './make-session-guard';
import { runConversationStep } from './run-conversation-step';
import type { GuestCommand } from './run-guest-turn';
import { runSessionCleanup } from './run-session-cleanup';
import type { ConversationSandboxSpec } from './setup-conversation-sandbox';
import { setupConversationSandbox } from './setup-conversation-sandbox';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRun,
  ResolvedProfile,
  SessionCleanupCause,
} from './types';

export interface ConversationRunnerOptions {
  readonly context: TasksContext;

  // the conversation role's profile, read once at start: a role change reaches the conversation
  // at its next start
  readonly profile: ResolvedProfile;
  readonly sandboxes: ConversationSandboxSpec['sandboxes'];
  readonly tools: Pick<ToolEndpoint, 'startRun'>;

  // the conversation's tool list, which its endpoint serves
  readonly toolNames: readonly string[];
  readonly image: string;
  readonly limits: ConversationSandboxSpec['limits'];
  readonly command: GuestCommand;

  // the persona in force, read at each turn so a new seed reaches the next turn
  readonly getSystemPrompt: () => string;
  readonly readTurnNote?: NonNullable<ConversationRun['readTurnNote']>;

  // the lines of a new session's status, in order; the kind of start, the start time and the model
  // when the server passes none
  readonly status?: ConversationRun['status'];

  // the memory store, which starts after the runner, so each turn reads it again
  readonly memory: () => ConversationMemory;
  readonly memorySettings?: Partial<ConversationMemorySettings>;

  // the IANA zone your message renders its send time in when it carries no zone of its own
  readonly defaultZone?: string;

  // the server's log, which takes a warning when a replaced sandbox's session does not carry over
  readonly log: ConversationSandboxSpec['log'];
}

export interface ConversationRunner {
  readonly runStep: RunStep;

  // the session cleanup a forget runs, which invalidates and removes the conversation's session
  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;
  readonly stop: () => Promise<void>;
}

// How memory reaches the conversation when the deployment sets nothing: 5 retrieved items above a
// keyword score of 0.25, a rebuilt session that starts with up to 30,000 tokens of recent turns,
// and no owner's or agent's name.
const defaultMemorySettings: ConversationMemorySettings = {
  retrievalItems: 5,
  retrievalMinScore: 0.25,
  rebuildTokens: 30_000,
  ownerName: null,
  agentNames: [],
};

// Starts the conversation's runner on its role's profile: it stores the profile's credential with
// the sandbox backend, keeps the conversation's long-lived sandbox when its spec still matches and
// replaces it otherwise, and opens the conversation's tool endpoint.
export async function startConversationRunner(
  options: ConversationRunnerOptions,
): Promise<ConversationRunner> {
  const secret = deriveModelSecret(options.profile);

  await options.sandboxes.addSecret(secret);

  const sandbox = await setupConversationSandbox(options, secret);

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

  const run: ConversationRun = {
    ...options,
    sandbox,
    endpoint,
    model,
    memorySettings: { ...defaultMemorySettings, ...options.memorySettings },
    status: options.status ?? buildDefaultStatus(),

    // a runner given no zone renders a message that carries none in UTC
    defaultZone: options.defaultZone ?? 'UTC',
    session: makeSessionGuard(),
  };

  return {
    runStep: (input) => {
      if (input.taskID !== conversationTaskID) {
        return Promise.reject(
          new Error(`the conversation runner runs the conversation only, not ${input.taskID}`),
        );
      }

      return runConversationStep(run, input);
    },
    cleanupSessions: (cause) => runSessionCleanup(run, cause),
    stop: () => endpoint.stop(),
  };
}
