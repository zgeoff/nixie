import type { StepInput } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { CompletedTurn } from './build-step-result';
import type { OpeningRecord, SessionOpening } from './read-session-opening';
import { readSessionOpening } from './read-session-opening';
import type { TurnContext } from './read-turn-context';
import { runLiveTurn } from './run-live-turn';
import type { ConversationRun, MessageTimeOptions, SessionStart } from './types';

// One step's turn: the run, the step, what memory adds, and the signal that stops it.
export interface SessionTurn {
  readonly run: ConversationRun;
  readonly input: StepInput;
  readonly context: TurnContext;

  // the newest session invalidation the step saw before the turn ran
  readonly invalidatedThrough: number;

  // the image bytes, in base64, the session holds before the turn: 0 for a new session
  readonly imageBytes: number;

  // aborts when the step's lease is lost or a forget invalidates the session
  readonly signal: AbortSignal;
}

// Where a turn runs: at a session point, or on a new session and how it starts.
export type TurnSession =
  | { readonly resume: SessionPoint }
  | { readonly resume: null; readonly start: SessionStart };

export interface PlannedTurn {
  readonly completed: CompletedTurn;

  // what a new session's opening record keeps, or null for a resumed session
  readonly opening: OpeningRecord | null;
}

// Runs the turn at the session point, or on a new session after the blocks it opens with. A turn that a forget invalidated while it ran throws, so the step retries on a rebuilt session
// and never commits a boundary in a session the forget removed.
export async function runPlannedTurn(
  turn: SessionTurn,
  session: TurnSession,
): Promise<PlannedTurn> {
  const times = { defaultZone: turn.run.defaultZone, now: new Date(turn.run.context.clock.now()) };
  const opening = session.resume === null ? await readOpening(turn, session.start, times) : null;

  const completed = await runLiveTurn(turn.run, turn.input, {
    resume: session.resume,
    systemPrompt: turn.context.systemPrompt,
    preamble: [...(opening?.blocks ?? []), ...turn.context.preamble],
    signal: turn.signal,
    times,
    imageBytes: turn.imageBytes,
  });

  turn.signal.throwIfAborted();

  return { completed, opening: opening?.record ?? null };
}

function readOpening(
  turn: SessionTurn,
  start: SessionStart,
  times: MessageTimeOptions,
): Promise<SessionOpening> {
  return readSessionOpening(turn.run.context, {
    taskID: turn.input.taskID,
    start,
    beforeSequence: Math.min(
      Number.MAX_SAFE_INTEGER,
      ...turn.input.inbox.map((record) => record.sequence),
    ),
    rebuildTokens: turn.run.memorySettings.rebuildTokens,
    times,
    zone: findNewestZone(turn.input.inbox),
    pinnedMemory: turn.context.pinnedMemory,
    model: turn.run.profile.profile.model,
    status: turn.run.status,
    ...(turn.run.readTurnNote === undefined ? {} : { readTurnNote: turn.run.readTurnNote }),
  });
}

// the zone your newest message in the inbox carries, as its send time shows
function findNewestZone(inbox: StepInput['inbox']): string | null {
  const zone = inbox.findLast((record) => record.kind === 'owner_message')?.payload['timeZone'];

  return typeof zone === 'string' ? zone : null;
}
