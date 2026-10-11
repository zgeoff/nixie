import type { Sandbox } from '@heynixie/sandbox';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import type { RunEndpoint, ToolRunModel } from '@heynixie/tools';
import type { SessionPoint } from '@heynixie/wire';
import type { CompletedTurn } from './build-step-result';
import { readLiveInbox } from './read-live-inbox';
import type { GuestCommand } from './run-guest-turn';
import { runGuestTurn } from './run-guest-turn';
import { toInboxMessage } from './to-inbox-message';
import type { ResolvedProfile } from './types';

// The conversation's runner as one step sees it: its sandbox, its endpoint and its profile.
export interface ConversationRun {
  readonly context: TasksContext;
  readonly profile: ResolvedProfile;
  readonly sandbox: Sandbox;
  readonly endpoint: Pick<RunEndpoint, 'token'>;
  readonly model: ToolRunModel;
  readonly command: GuestCommand;
  readonly systemPrompt: string;
}

// Runs one turn in the guest on the step's inbox, resuming at the session point when there is
// one, and passes in each inbox record that lands while the turn runs.
export async function runLiveTurn(
  run: ConversationRun,
  input: StepInput,
  resume: SessionPoint | null,
): Promise<CompletedTurn> {
  const route = await run.sandbox.toolRoute();

  if (route === null) {
    throw new Error('the conversation sandbox has no tool route');
  }
  const sent = new Set(input.inbox.map((record) => record.sequence));
  const live = new AbortController();
  const profile = run.profile.profile;

  try {
    const turn = await runGuestTurn({
      sandbox: run.sandbox,
      command: run.command,
      turn: {
        type: 'turn',
        profile: {
          model: profile.model,
          baseURL: profile.baseURL,
          effort: profile.effort,
          authHeader: profile.authHeader,
        },
        tools: { url: route.url, token: run.endpoint.token },
        resume,
        systemPrompt: run.systemPrompt,
        input: input.inbox.map((record) => toInboxMessage(record)),
      },
      messages: readLiveInbox(run.context, { taskID: input.taskID, sent, signal: live.signal }),
      signal: input.signal,
    });

    return { turn, sent };
  } finally {
    live.abort();
  }
}
