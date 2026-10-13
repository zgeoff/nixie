import type { StepInput } from '@heynixie/tasks';
import type { InboxMessage, SessionPoint, TurnProfile } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { CompletedTurn } from './build-step-result';
import { inboxBatchLimit } from './inbox-batch-limit';
import { readLiveInbox } from './read-live-inbox';
import { readRecalledThrough } from './read-recalled-through';
import { runGuestTurn } from './run-guest-turn';
import { toInboxMessage } from './to-inbox-message';
import type { ConversationRun, ResolvedProfile, TurnNote } from './types';

// The session a turn runs on and what it opens with.
export interface LiveTurnPlan {
  // the session point to resume at, or null for a new session
  readonly resume: SessionPoint | null;
  readonly systemPrompt: string;

  // the blocks that go before the turn's first message, such as a new session's marker and history
  readonly preamble: readonly string[];

  // aborts when the step's lease is lost or a forget invalidates the session
  readonly signal: AbortSignal;
}

// Runs one turn in the guest on the step's inbox, up to the batch limit, resuming at the session
// point when there is one. Only a turn that took the whole inbox takes the records that land while
// it runs, so the read cursor never meets a gap and no record reaches the model twice.
export async function runLiveTurn(
  run: ConversationRun,
  input: StepInput,
  plan: LiveTurnPlan,
): Promise<CompletedTurn> {
  plan.signal.throwIfAborted();

  const [url, note] = await Promise.all([getToolURL(run, plan.signal), readTurnNote(run)]);
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
        tools: { url, token: run.endpoint.token },
        resume: plan.resume,
        systemPrompt: plan.systemPrompt,
        input: buildTurnInput(
          batch.map((record) => toInboxMessage(record)),
          [...plan.preamble, note?.text ?? null],
        ),
      },
      messages: hasMore
        ? []
        : readLiveInbox(run.context, { taskID: input.taskID, sent, signal: live.signal }),
      signal: plan.signal,
      readEndedMark: () => readRecalledThrough(run.context, input.taskID),
    });

    return { turn, sent, hasMore, notedThrough: note?.throughSequence ?? null };
  } finally {
    live.abort();
  }
}

function readTurnNote(run: ConversationRun): Promise<TurnNote | null> {
  return run.readTurnNote === undefined ? Promise.resolve(null) : run.readTurnNote();
}

// a forget that aborted the turn while the route was read stops the turn before a guest starts
async function getToolURL(run: ConversationRun, signal: AbortSignal): Promise<string> {
  const route = await run.sandbox.toolRoute();

  signal.throwIfAborted();

  // a conversation sandbox's spec always asks for a tool route, and every adapter gives one then
  invariant(route, 'the conversation sandbox has no tool route');
  return route.url;
}

// the preamble goes before your first message in the same message, so the model reads it first
// and the message keeps the uuid that acknowledges its record
function buildTurnInput(
  messages: readonly InboxMessage[],
  blocks: readonly (string | null)[],
): readonly InboxMessage[] {
  const [first, ...rest] = messages;
  const preamble = blocks.filter((block) => block !== null);

  if (first === undefined || preamble.length === 0) {
    return messages;
  }
  return [{ uuid: first.uuid, text: [...preamble, first.text].join('\n\n') }, ...rest];
}

// the profile as the guest needs it, with no credential reference and no prices
function toTurnProfile(profile: ResolvedProfile['profile']): TurnProfile {
  return {
    model: profile.model,
    baseURL: profile.baseURL,
    effort: profile.effort,
    authHeader: profile.authHeader,
    contextTokens: profile.contextTokens,
  };
}
