import type { StepInput } from '@heynixie/tasks';
import type { SessionPoint, TurnProfile } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { CompletedTurn } from './build-step-result';
import { inboxBatchLimit } from './inbox-batch-limit';
import { readLiveInbox } from './read-live-inbox';
import { runGuestTurn } from './run-guest-turn';
import { toInboxMessage } from './to-inbox-message';
import type { ConversationRun, ResolvedProfile } from './types';

// Runs one turn in the guest on the step's inbox, up to the batch limit, resuming at the session
// point when there is one. Only a turn that took the whole inbox takes the records that land while
// it runs, so the read cursor never meets a gap and no record reaches the model twice.
export async function runLiveTurn(
  run: ConversationRun,
  input: StepInput,
  resume: SessionPoint | null,
): Promise<CompletedTurn> {
  const route = await run.sandbox.toolRoute();

  // a conversation sandbox's spec always asks for a tool route, and every adapter gives one then
  invariant(route, 'the conversation sandbox has no tool route');
  const batch = input.inbox.slice(0, inboxBatchLimit);
  const sent = new Set(batch.map((record) => record.sequence));
  const live = new AbortController();
  const hasMore = input.inbox.length > batch.length;

  try {
    const turn = await runGuestTurn({
      sandbox: run.sandbox,
      command: run.command,
      turn: {
        type: 'turn',
        profile: toTurnProfile(run.profile.profile),
        tools: { url: route.url, token: run.endpoint.token },
        resume,
        systemPrompt: run.getSystemPrompt(),
        input: batch.map((record) => toInboxMessage(record)),
      },
      messages: hasMore
        ? []
        : readLiveInbox(run.context, { taskID: input.taskID, sent, signal: live.signal }),
      signal: input.signal,
    });

    return { turn, sent, hasMore };
  } finally {
    live.abort();
  }
}

// the profile as the guest needs it, with no credential reference and no prices
function toTurnProfile(profile: ResolvedProfile['profile']): TurnProfile {
  return {
    model: profile.model,
    baseURL: profile.baseURL,
    effort: profile.effort,
    authHeader: profile.authHeader,
  };
}
