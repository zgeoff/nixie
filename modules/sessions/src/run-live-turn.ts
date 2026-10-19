import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import type { InboxMessage, SessionPoint } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { CompletedTurn } from './build-step-result';
import { readLiveInbox } from './read-live-inbox';
import { readOpeningBatch } from './read-opening-batch';
import { readRecalledThrough } from './read-recalled-through';
import { runGuestTurn } from './run-guest-turn';
import type { ConversationRun, ImageTally, MessageTimeOptions, TurnNote } from './types';

// The session a turn runs on and what it opens with.
export interface LiveTurnPlan {
  // the session point to resume at, or null for a new session
  readonly resume: SessionPoint | null;
  readonly systemPrompt: string;

  // the blocks that go before the turn's first message, such as a new session's marker and history
  readonly preamble: readonly string[];

  // aborts when the step's lease is lost or a forget invalidates the session
  readonly signal: AbortSignal;

  // how each message renders its send time
  readonly times: MessageTimeOptions;

  // the images the session holds before the turn: none for a new session
  readonly images: ImageTally;
}

// Runs one turn in the guest on the step's inbox, as much as readTurnBatch lets through, resuming at
// the session point when there is one. Only a turn that took the whole inbox takes the records that
// land while it runs, so the read cursor never meets a gap and no record reaches the model twice.
export async function runLiveTurn(
  run: ConversationRun,
  input: StepInput,
  plan: LiveTurnPlan,
): Promise<CompletedTurn> {
  const stepToken = run.endpoint.startStep(buildStepRunID(input));

  try {
    return await runTokenTurn(run, input, { ...plan, token: stepToken.token });
  } finally {
    await stepToken.stop();
  }
}

// the guest reaches its tools with the turn's own step token, so each call carries the step's run
// identity
async function runTokenTurn(
  run: ConversationRun,
  input: StepInput,
  plan: LiveTurnPlan & { readonly token: string },
): Promise<CompletedTurn> {
  plan.signal.throwIfAborted();

  const [url, note] = await Promise.all([
    getToolURL(run, plan.signal),
    readTurnNote(run, plan.resume === null),
  ]);

  const opening = await readOpeningBatch(run.context.log, input.inbox, plan);

  const sent = new Set(opening.batch.records.map((record) => record.sequence));
  const live = new AbortController();

  const hasMore = input.inbox.length > opening.batch.records.length;

  try {
    const turn = await runGuestTurn({
      sandbox: run.sandbox,
      command: run.command,
      turn: {
        type: 'turn',
        profile: run.turnProfile,
        tools: { url, token: plan.token },
        resume: plan.resume,
        systemPrompt: plan.systemPrompt,
        input: buildTurnInput(opening.batch.messages, [...plan.preamble, note?.text ?? null]),
      },
      messages: hasMore
        ? []
        : readLiveInbox(run.context, {
            taskID: input.taskID,
            sent,
            signal: live.signal,
            times: plan.times,
            images: opening.images,
          }),
      signal: plan.signal,
      readRecallMark: () => readRecalledThrough(run.context, input.taskID),
    });

    // a live message that waits on the image budget asks for the next step at once
    return {
      turn,
      sent,
      hasMore: hasMore || opening.images.isCapped,
      notedThrough: note?.throughSequence ?? null,
      images: opening.images.spent,
    };
  } finally {
    live.abort();
  }
}

function readTurnNote(run: ConversationRun, isNewSession: boolean): Promise<TurnNote | null> {
  return run.readTurnNote === undefined
    ? Promise.resolve(null)
    : run.readTurnNote({ isNewSession });
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

  return [{ ...first, text: [...preamble, first.text].join('\n\n') }, ...rest];
}
