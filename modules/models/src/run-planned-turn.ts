import type { StepInput } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { CompletedTurn } from './build-step-result';
import { readSessionOpening } from './read-session-opening';
import type { TurnContext } from './read-turn-context';
import { runLiveTurn } from './run-live-turn';
import type { LostSession } from './run-rebuilt-turn';
import type { ConversationRun } from './types';

// One step's turn: the run, the step, what memory adds, and the signal that stops it.
export interface SessionTurn {
  readonly run: ConversationRun;
  readonly input: StepInput;
  readonly context: TurnContext;

  // the newest session invalidation the step saw before the turn ran
  readonly invalidatedThrough: number;

  // aborts when the step's lease is lost or a forget invalidates the session
  readonly signal: AbortSignal;
}

// Where a turn runs: at a session point, or on a new session in place of the lost one, if any.
export type TurnSession =
  | { readonly resume: SessionPoint }
  | { readonly resume: null; readonly lost: LostSession | null };

export interface PlannedTurn {
  readonly completed: CompletedTurn;

  // how many recent records a new session's first turn carried
  readonly recentRecords: number;
}

// Runs the turn at the session point or on a new session, after the blocks the session opens with.
// A turn that a forget invalidated while it ran throws, so the step retries on a rebuilt session
// and never commits a boundary in a session the forget removed.
export async function runPlannedTurn(
  turn: SessionTurn,
  session: TurnSession,
): Promise<PlannedTurn> {
  const times = { defaultZone: turn.run.defaultZone, now: new Date(turn.run.context.clock.now()) };
  const opening = await readSessionOpening(turn.run.context, session, {
    taskID: turn.input.taskID,
    beforeSequence: Math.min(
      Number.MAX_SAFE_INTEGER,
      ...turn.input.inbox.map((record) => record.sequence),
    ),
    rebuildTokens: turn.run.memorySettings.rebuildTokens,
    times,
  });
  const completed = await runLiveTurn(turn.run, turn.input, {
    resume: session.resume,
    systemPrompt: turn.context.systemPrompt,
    preamble: [...opening.blocks, ...turn.context.preamble].filter((block) => block !== null),
    signal: turn.signal,
    times,
  });

  turn.signal.throwIfAborted();
  return { completed, recentRecords: opening.recentRecords };
}
