import type { StepInput } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { CompletedTurn } from './build-step-result';
import { readRecentTurns } from './read-recent-turns';
import type { TurnContext } from './read-turn-context';
import { renderSessionHistory } from './render-session-history';
import { runLiveTurn } from './run-live-turn';
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

export interface PlannedTurn {
  readonly completed: CompletedTurn;

  // how many recent records a new session's first turn carried
  readonly recentRecords: number;
}

// Runs the turn at the session point, or on a new session whose first turn carries the thread's
// recent turns before your message. A turn that a forget invalidated while it ran throws, so the
// step retries on a rebuilt session and never commits a boundary in a session the forget removed.
export async function runPlannedTurn(
  turn: SessionTurn,
  resume: SessionPoint | null,
): Promise<PlannedTurn> {
  const recent =
    resume === null
      ? await readRecentTurns(turn.run.context, {
          taskID: turn.input.taskID,
          beforeSequence: Math.min(
            Number.MAX_SAFE_INTEGER,
            ...turn.input.inbox.map((record) => record.sequence),
          ),
          tokens: turn.run.memorySettings.rebuildTokens,
        })
      : [];
  const history = renderSessionHistory(recent);
  const completed = await runLiveTurn(turn.run, turn.input, {
    resume,
    systemPrompt: turn.context.systemPrompt,
    preamble: history === null ? turn.context.preamble : [history, ...turn.context.preamble],
    signal: turn.signal,
  });

  turn.signal.throwIfAborted();
  return { completed, recentRecords: recent.length };
}
