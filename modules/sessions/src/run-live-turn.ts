import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import type { ToolSession } from '@heynixie/tools';
import type { InboxMessage, SessionPoint } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { CompletedTurn } from './build-step-result';
import { readLiveInbox } from './read-live-inbox';
import { readOpeningBatch } from './read-opening-batch';
import { readRecalledThrough } from './read-recalled-through';
import { runGuestTurn } from './run-guest-turn';
import type { ConversationRun, ImageTally, MessageTimeOptions, TurnNote } from './types';

export interface LiveTurnPlan {
  readonly resume: SessionPoint | null;
  readonly systemPrompt: string;

  readonly preamble: readonly string[];

  readonly signal: AbortSignal;

  readonly times: MessageTimeOptions;

  readonly images: ImageTally;

  // the session the turn runs on, which the turn's step token hands each tool call
  readonly session: ToolSession;
}

export async function runLiveTurn(
  run: ConversationRun,
  input: StepInput,
  plan: LiveTurnPlan,
): Promise<CompletedTurn> {
  const stepToken = run.endpoint.startStep(buildStepRunID(input), plan.session);

  try {
    return await runTokenTurn(run, input, { ...plan, token: stepToken.token });
  } finally {
    await stepToken.stop();
  }
}

async function runTokenTurn(
  run: ConversationRun,
  input: StepInput,
  plan: LiveTurnPlan & { readonly token: string },
): Promise<CompletedTurn> {
  plan.signal.throwIfAborted();

  const [url, note] = await Promise.all([
    readToolURL(run, plan.signal),
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

async function readToolURL(run: ConversationRun, signal: AbortSignal): Promise<string> {
  const route = await run.sandbox.toolRoute();

  signal.throwIfAborted();

  invariant(route, 'the conversation sandbox has no tool route');

  return route.url;
}

function readTurnNote(run: ConversationRun, isNewSession: boolean): Promise<TurnNote | null> {
  return run.readTurnNote === undefined
    ? Promise.resolve(null)
    : run.readTurnNote({ isNewSession });
}

// The SDK acknowledges an inbox record by its message's uuid, so the preamble joins the first
// message rather than going in a message of its own.
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
