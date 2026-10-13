import type { StepInput } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { CompletedTurn } from './build-step-result';
import { readRecentTurns } from './read-recent-turns';
import type { TurnContext } from './read-turn-context';
import { renderSessionHistory } from './render-session-history';
import { renderSessionMarker } from './render-session-marker';
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

// Runs the turn at the session point, or on a new session that opens with its marker and the
// thread's recent turns. A turn that a forget invalidated while it ran throws, so the step retries
// on a rebuilt session and never commits a boundary in a session the forget removed.
export async function runPlannedTurn(
  turn: SessionTurn,
  session: TurnSession,
): Promise<PlannedTurn> {
  const recent =
    session.resume === null
      ? await readRecentTurns(turn.run.context, {
          taskID: turn.input.taskID,
          beforeSequence: Math.min(
            Number.MAX_SAFE_INTEGER,
            ...turn.input.inbox.map((record) => record.sequence),
          ),
          tokens: turn.run.memorySettings.rebuildTokens,
        })
      : [];
  const opening =
    session.resume === null
      ? [renderSessionMarker(session.lost), renderSessionHistory(recent)]
      : [];
  const completed = await runLiveTurn(turn.run, turn.input, {
    resume: session.resume,
    systemPrompt: turn.context.systemPrompt,
    preamble: [...opening, ...turn.context.preamble].filter((block) => block !== null),
    signal: turn.signal,
  });

  turn.signal.throwIfAborted();
  return { completed, recentRecords: recent.length };
}
