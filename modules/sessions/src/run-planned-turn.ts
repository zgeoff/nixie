import type { StepInput } from '@heynixie/tasks';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import type { CompletedTurn } from './build-step-result';
import type { OpeningRecord, SessionOpening } from './read-session-opening';
import { readSessionOpening } from './read-session-opening';
import type { TurnContext } from './read-turn-context';
import { runLiveTurn } from './run-live-turn';
import type {
  ConversationRun,
  ImageTally,
  MessageTimeOptions,
  SessionDefinitions,
  SessionStart,
} from './types';

export interface SessionTurn {
  readonly run: ConversationRun;
  readonly input: StepInput;
  readonly definitions: SessionDefinitions;
  readonly context: TurnContext;

  readonly invalidatedThrough: number;

  readonly images: ImageTally;

  // the key of the session the turn runs on, which each of its tool calls carries: a new one for a
  // new session, which its opening record keeps
  readonly sessionKey: string;

  readonly signal: AbortSignal;
}

export type TurnSession =
  | { readonly resume: SessionPoint }
  | { readonly resume: null; readonly start: SessionStart };

export interface PlannedTurn {
  readonly completed: CompletedTurn;

  readonly opening: OpeningRecord | null;
}

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
    view: { messaging: turn.run.messaging, wake: turn.input.wake },
    images: turn.images,
    session: { key: turn.sessionKey, invalidatedThrough: turn.invalidatedThrough },
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

function findNewestZone(inbox: StepInput['inbox']): string | null {
  const message = inbox.findLast((record) => record.kind === 'owner_message');

  const zone =
    message === undefined
      ? undefined
      : ownerMessageCodec.tryDecodePartial(message.payload)?.timeZone;

  return zone ?? null;
}
