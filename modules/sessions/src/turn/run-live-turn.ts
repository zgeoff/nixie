import type { StepInput } from '@heynixie/tasks';
import { LeaseLostError, buildStepRunID, conversationTaskID } from '@heynixie/tasks';
import type { ToolSession } from '@heynixie/tools';
import type { InboxMessage, SessionPoint } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { renderHeldMessages } from '../held/render-held-messages';
import { makeGapReader } from '../inbox/make-gap-reader';
import { readLiveInbox } from '../inbox/read-live-inbox';
import { buildStepPolicyFrame } from '../step/build-step-policy-frame';
import type { CompletedTurn } from '../step/build-step-result';
import { makeImageReserver } from '../task/make-image-reserver';
import { makeImageRoomHolder } from '../task/make-image-room-holder';
import { makeImageRoomReader } from '../task/make-image-room-reader';
import type { TaskMessageView } from '../task/render-task-message';
import type {
  ConversationRun,
  GapReader,
  ImageTally,
  MessageTimeOptions,
  TurnNote,
} from '../types';
import type { TurnSilence } from '../utils/build-turn-silence';
import { buildTurnSilence } from '../utils/build-turn-silence';
import type { AssistantFrame } from '../utils/run-guest-turn';
import { runGuestTurn } from '../utils/run-guest-turn';
import type { OpeningBatch } from './read-opening-batch';
import { readOpeningBatch } from './read-opening-batch';
import { readTurnRecalledThrough } from './read-turn-recalled-through';
import { buildStepHold, buildTaskRun, runApprovedCalls } from './run-approved-calls';
import { writeLiveReply } from './write-live-reply';
import { writeReplyVoids } from './write-reply-voids';

export interface LiveTurnPlan {
  readonly resume: SessionPoint | null;
  readonly systemPrompt: string;

  readonly preamble: readonly string[];

  readonly signal: AbortSignal;

  readonly times: MessageTimeOptions;
  readonly view: TaskMessageView;

  readonly images: ImageTally;

  // the session the turn runs on, which the turn's step token hands each tool call
  readonly session: ToolSession;
}

interface LiveWrites {
  // the sequences of the replies written so far, in order
  readonly written: number[];

  // the reasoning summaries sent since the last reply
  readonly summaries: string[];
}

export async function runLiveTurn(
  run: ConversationRun,
  stepInput: StepInput,
  plan: LiveTurnPlan,
): Promise<CompletedTurn> {
  const input = await runApprovedCalls(run, stepInput, plan);

  const gaps = input.taskID === conversationTaskID ? makeGapReader(run.context) : undefined;

  const opening = await readOpeningBatch(run.context, input.inbox, {
    ...plan,
    ...(gaps === undefined ? {} : { gaps }),
    imageBudget: run.imageBudget,
    ...(run.inStepActions === undefined ? {} : { replies: run.inStepActions.replies }),
  });

  const silence = buildTurnSilence(opening.batch.records);
  const taskRun = buildTaskRun(input);

  const stepToken = run.endpoint.startStep(
    buildStepRunID(input),
    {
      ...plan.session,
      reserveImages: makeImageReserver(opening.images),
      readImageRoom: makeImageRoomReader(opening.images),
      ...makeImageRoomHolder(opening.images),
      endSilently: silence.end,
      policy: buildStepPolicyFrame(run.frame, opening.batch.records),
      step: buildStepHold(run, input, plan.signal),
    },
    taskRun,
  );

  const live: LiveWrites = { written: [], summaries: [] };

  try {
    return await runTokenTurn(run, input, {
      ...plan,
      token: stepToken.token,
      opening,
      silence,
      live,
      ...(gaps === undefined ? {} : { gaps }),
    });
  } catch (error) {
    await voidFailedAttempt(run, input, live.written, error);

    throw error;
  } finally {
    await stepToken.stop();
  }
}

interface TokenTurnPlan extends LiveTurnPlan {
  readonly token: string;
  readonly opening: OpeningBatch;
  readonly silence: TurnSilence;
  readonly live: LiveWrites;
  readonly gaps?: GapReader;
}

// A turn that throws keeps none of the replies it wrote. A runner that lost its lease writes
// nothing, and the next step's sweep voids what it left. A failed void write leaves the sweep the
// same work, and must not hide the error that failed the turn.
export async function voidFailedAttempt(
  run: Pick<ConversationRun, 'context' | 'log'>,
  input: StepInput,
  sequences: readonly number[],
  cause: unknown,
): Promise<void> {
  if (cause instanceof LeaseLostError || sequences.length === 0) {
    return;
  }

  try {
    await writeReplyVoids(run, input, [
      { sequences, runID: buildStepRunID(input), reason: 'attempt_failed' },
    ]);
  } catch (error) {
    run.log(
      'reply_void.failed',
      { error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
  }
}

async function runTokenTurn(
  run: ConversationRun,
  input: StepInput,
  plan: TokenTurnPlan,
): Promise<CompletedTurn> {
  plan.signal.throwIfAborted();

  const [url, note] = await Promise.all([
    readToolURL(run, plan.signal),
    readTurnNote(run, plan.resume === null),
  ]);

  const opening = plan.opening;

  const sent = new Set(opening.batch.records.map((record) => record.sequence));

  const held = renderHeldMessages(opening.batch.records, plan.times, plan.view);

  const live = new AbortController();

  const hasMore = input.inbox.length > opening.batch.records.length;

  try {
    const capabilities = run.harness.capabilities;

    const turn = await runGuestTurn({
      harness: run.harness,
      sandbox: run.sandbox,
      command: run.command,
      turn: {
        type: 'turn',
        profile: run.turnProfile,
        tools: { url, token: plan.token },
        ...(run.harness.session === null ? {} : { resume: plan.resume }),
        systemPrompt: plan.systemPrompt,
        limits: {
          modelCalls: capabilities.has('turn-limit') ? (run.modelCallLimit ?? null) : null,
          toolCallWaitMs: run.harness.toolCallWaitMs,
        },
        input: buildTurnInput(opening.batch.messages, [...plan.preamble, note?.text ?? null, held]),
      },
      messages:
        hasMore || !capabilities.has('live-messages')
          ? []
          : readLiveInbox(run.context, {
              taskID: input.taskID,
              canCut: capabilities.has('live-cut'),
              sent,
              signal: live.signal,
              times: plan.times,
              view: plan.view,
              images: opening.images,
              silence: plan.silence,
              ...(plan.gaps === undefined ? {} : { gaps: plan.gaps }),
              log: run.log,
            }),
      signal: plan.signal,
      ...(capabilities.has('interrupt') ? { interrupt: input.interrupt } : {}),
      readRecallMark: () => readTurnRecalledThrough(run.context, input),
      ...(run.onModelCall === undefined ? {} : { onCall: run.onModelCall }),
      onAssistant: (frame) => writeAssistantReply(run, input, plan.live, frame),
    });

    return {
      turn,
      sent,
      silent: new Set(opening.batch.silent.map((record) => record.sequence)),
      hasMore: hasMore || opening.images.isCapped,
      notedThrough: note?.throughSequence ?? null,
      images: opening.images.spent,
      isSilent: plan.silence.isSilent(),
      runID: buildStepRunID(input),
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
// message rather than going in a message of its own. A turn with no message, such as a started
// task's first, sends the preamble alone under a uuid that names no inbox record.
function buildTurnInput(
  messages: readonly InboxMessage[],
  blocks: readonly (string | null)[],
): readonly InboxMessage[] {
  const [first, ...rest] = messages;
  const preamble = blocks.filter((block) => block !== null);

  if (first === undefined && preamble.length > 0) {
    return [{ uuid: crypto.randomUUID(), text: preamble.join('\n\n') }];
  }

  if (first === undefined || preamble.length === 0) {
    return messages;
  }

  return [{ ...first, text: [...preamble, first.text].join('\n\n') }, ...rest];
}

async function writeAssistantReply(
  run: ConversationRun,
  input: StepInput,
  live: LiveWrites,
  frame: AssistantFrame,
): Promise<number | null> {
  if (frame.summary !== undefined) {
    live.summaries.push(frame.summary);
  }

  if (frame.text === '') {
    return null;
  }

  const sequence = await writeLiveReply(run, input, {
    messageID: frame.messageID,
    text: frame.text,
    summary: live.summaries.splice(0).join('\n\n'),
    runID: buildStepRunID(input),
  });

  live.written.push(sequence);

  return sequence;
}
