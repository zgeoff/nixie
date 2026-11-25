import { callHandedOffCodec } from '@heynixie/calls';
import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { StepInput, StepResult, TasksContext } from '@heynixie/tasks';
import { buildStepRunID, conversationTaskID, readCallTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { CallStepHooks } from '../task/sandbox-runner-options';
import type { TurnReplies } from './read-turn-replies';
import { readTurnReplies } from './read-turn-replies';

export interface CallStep {
  readonly context: Pick<TasksContext, 'log'>;
  readonly hooks: CallStepHooks | undefined;
  readonly input: StepInput;
  readonly runTurn: () => Promise<StepResult>;
}

// Reads the call that the task holds, then runs its turn.
export async function runCallStep(step: CallStep): Promise<StepResult> {
  const call = await readCallTask(step.context, step.input.taskID);

  invariant(
    step.hooks !== undefined && call !== null,
    `the task ${step.input.taskID} is no call's`,
  );

  return runCallTurn({
    context: step.context,
    hooks: step.hooks,
    input: step.input,
    callID: call.callID,
    runTurn: step.runTurn,
  });
}

export interface CallTurn {
  readonly context: Pick<TasksContext, 'log'>;
  readonly hooks: CallStepHooks;
  readonly input: StepInput;
  readonly callID: string;

  // runs the model turn of the call's step
  readonly runTurn: () => Promise<StepResult>;
}

// One step of a call's thread. A hand-off's turn answers the speech layer when it ends. The turn
// that carries the closing marker reports its reply to the conversation as the call's summary.
export async function runCallTurn(turn: CallTurn): Promise<StepResult> {
  const isClosing = turn.input.inbox.some((record) => record.kind === 'call.closing');

  const ended = await turn
    .runTurn()
    .then((result) => ({ result, error: null }))
    .catch((error: unknown) => ({ result: null, error }));

  if (isClosing) {
    return writeClosing(turn, ended.result);
  }

  if (ended.result === null) {
    await sendAnswers(turn, pickHandOffIDs(turn.input.inbox), {
      replies: { texts: [], lastReplyRecordID: null },
      isFailed: true,
    });

    throw ended.error;
  }

  // A turn that the user cut writes no answer: the speech layer stopped speaking it.
  if (!turn.input.interrupt.aborted) {
    const replies = await readTurnReplies(
      turn.context,
      turn.input.taskID,
      buildStepRunID(turn.input),
    );

    const isLimited = ended.result.run?.limit !== undefined;

    const handOffIDs = await readTakenHandOffs(turn, ended.result, isLimited);

    await sendAnswers(turn, handOffIDs, {
      replies,
      isFailed: isLimited,
    });
  }

  return ended.result;
}

async function writeClosing(turn: CallTurn, result: StepResult | null): Promise<StepResult> {
  const replies =
    result === null
      ? null
      : await readTurnReplies(turn.context, turn.input.taskID, buildStepRunID(turn.input));

  const summary = replies?.texts.join('\n\n').trim() ?? '';

  const body =
    summary === ''
      ? `The call ${turn.callID} ended with no summary. Its record is the thread of the task ${turn.input.taskID}.`
      : summary;

  return {
    ...(result ?? { records: [], acknowledged: turn.input.inbox.map((record) => record.sequence) }),
    next: 'done',
    isFinal: true,
    sessionBoundary: result?.sessionBoundary ?? turn.input.sessionBoundary,
    messages: [
      {
        to: conversationTaskID,
        kind: 'report',
        body,
        replyTo: null,
        onBehalfOf: [],
        wake: false,
      },
    ],
  };
}

interface AnswerOptions {
  readonly replies: TurnReplies;
  readonly isFailed: boolean;
}

// The turn's one answer goes to each hand-off it took, oldest first, so each hand-off gets exactly
// one answer and the newest one is the last the speech layer hears.
async function sendAnswers(
  turn: CallTurn,
  handOffIDs: readonly string[],
  options: AnswerOptions,
): Promise<void> {
  for (const handOffID of handOffIDs) {
    await turn.hooks.answer({
      callID: turn.callID,
      taskID: turn.input.taskID,
      handOffID,
      replies: options.replies.texts,
      replyRecordID: options.replies.lastReplyRecordID,
      isFailed: options.isFailed,
    });
  }
}

function pickHandOffIDs(records: readonly LogRecord[]): readonly string[] {
  return records
    .filter((entry) => entry.kind === callHandedOffCodec.kind)
    .map((entry) => callHandedOffCodec.decode(entry.payload).handOffID);
}

// The hand-offs a turn took: those its inbox started with and those that landed during it, which
// the live inbox passed in and the step acknowledged. A turn that stopped at a limit took none, so
// it answers the hand-offs it was given with the fixed line.
async function readTakenHandOffs(
  turn: CallTurn,
  result: StepResult,
  isLimited: boolean,
): Promise<readonly string[]> {
  if (isLimited) {
    return pickHandOffIDs(turn.input.inbox);
  }

  const acknowledged = new Set(result.acknowledged);

  const starting = turn.input.inbox.filter((record) => acknowledged.has(record.sequence));

  const known = new Set(turn.input.inbox.map((record) => record.sequence));

  const liveSequences = result.acknowledged.filter((sequence) => !known.has(sequence));

  const live =
    liveSequences.length === 0
      ? []
      : await readRecords(turn.context.log, {
          afterSequence: 0,
          thread: turn.input.taskID,
          kinds: [callHandedOffCodec.kind],
          sequences: liveSequences,
          limit: liveSequences.length,
        });

  return pickHandOffIDs(
    [...starting, ...live.map((entry) => entry.record)].toSorted(
      (earlier, later) => earlier.sequence - later.sequence,
    ),
  );
}
