import type { CompactionSettings } from '@heynixie/compaction';
import { deriveModelSecret, toTurnProfile } from '@heynixie/models';
import type { ResolvedProfile } from '@heynixie/models';
import type { RunStep, TaskMessaging, TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import { buildDefaultStatus } from './build-default-status';
import { makeSessionGuard } from './make-session-guard';
import { runConversationStep } from './run-conversation-step';
import { runSessionCleanup } from './run-session-cleanup';
import { sessionImageBudget } from './session-image-budget';
import type { ConversationSandboxSpec } from './setup-conversation-sandbox';
import { setupConversationSandbox } from './setup-conversation-sandbox';
import type {
  ConversationMemory,
  ConversationMemorySettings,
  ConversationRun,
  ImageTally,
  SessionCleanupCause,
} from './types';

export interface ConversationRunnerOptions {
  readonly context: TasksContext;

  readonly profile: ResolvedProfile;
  readonly sandboxes: ConversationSandboxSpec['sandboxes'];
  readonly tools: Pick<ToolEndpoint, 'startRun'>;

  readonly toolNames: readonly string[];
  readonly image: string;
  readonly limits: ConversationSandboxSpec['limits'];
  readonly command: ConversationRun['command'];

  readonly getDefinitions: ConversationRun['getDefinitions'];
  readonly readTurnNote?: NonNullable<ConversationRun['readTurnNote']>;
  readonly loadOrPinSkillCatalog?: NonNullable<ConversationRun['loadOrPinSkillCatalog']>;

  readonly status?: ConversationRun['status'];

  readonly memory: () => ConversationMemory;
  readonly memorySettings?: Partial<ConversationMemorySettings>;

  readonly compaction?: Partial<CompactionSettings>;

  readonly defaultZone?: string;

  readonly messaging?: TaskMessaging;

  readonly imageBudget?: ImageTally;

  readonly log: ConversationSandboxSpec['log'];
}

export interface ConversationRunner {
  readonly runStep: RunStep;

  readonly cleanupSessions: (cause: SessionCleanupCause) => Promise<void>;
  readonly stop: () => Promise<void>;
}

const defaultMemorySettings: ConversationMemorySettings = {
  retrievalItems: 5,
  retrievalSelfNotes: 2,
  retrievalMessages: 3,
  retrievalMinScore: 0.25,
  retrievalMinSimilarity: 0.38,
  rebuildTokens: 30_000,
  ownerName: null,
  agentNames: [],
};

const defaultCompaction: CompactionSettings = { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 };
const defaultMessaging: TaskMessaging = { directory: [], hopLimit: 20, ownerName: null };

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
    turnProfile: toTurnProfile(options.profile.profile),
    memorySettings: { ...defaultMemorySettings, ...options.memorySettings },
    compaction: { ...defaultCompaction, ...options.compaction },
    status: options.status ?? buildDefaultStatus(),

    defaultZone: options.defaultZone ?? 'UTC',
    messaging: options.messaging ?? defaultMessaging,
    imageBudget: options.imageBudget ?? sessionImageBudget,
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
