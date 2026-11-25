import type { CheckedTables } from '@heynixie/db';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';

// A coding adapter reaches one system that runs coding sessions. The coding runner drives one, and
// its key is the adapter's ID.
export interface CodingAdapter {
  // the runner key, such as 'atc'
  readonly id: string;
  readonly start: (
    brief: SessionBrief,
    idempotencyKey: string,
  ) => Promise<AdapterReply<StartedSession>>;

  // sends the session no key and nothing else
  readonly join: (session: SessionRef) => Promise<AdapterReply<StartedSession>>;
  readonly list: () => Promise<AdapterReply<readonly ReachableSession[]>>;
  readonly read: (session: SessionRef, options: ReadOptions) => Promise<AdapterReply<SessionRead>>;

  // types text into the session's input and presses Enter; takes no key
  readonly steer: (session: SessionRef, text: string) => Promise<AdapterReply<{ typed: true }>>;
  readonly message: (
    session: SessionRef,
    text: string,
    idempotencyKey: string,
  ) => Promise<AdapterReply<{ messageRef: string }>>;
  readonly stop: (session: SessionRef) => Promise<AdapterReply<{ stopped: boolean }>>;

  // Reads the event trail from the cursor, a page at a time, each page after the last. A page with
  // no events means the read caught up.
  readonly events: (
    cursor: string | null,
    signal: AbortSignal,
  ) => AsyncIterable<{ readonly cursor: string; readonly events: readonly SessionEvent[] }>;
}

export interface SessionBrief {
  readonly name: string;

  // the task's brief: the session's first user turn
  readonly prompt: string;
  readonly repo: { readonly url: string; readonly ref: string };
  readonly target: TargetRef;
  readonly agent?: string;
  readonly model?: string;
}

export interface TargetRef {
  // a daemon name in the system's registry
  readonly daemon: string;

  // that daemon's target ID
  readonly target: string;
}

export interface StartedSession {
  readonly session: SessionRef;
  readonly state: SessionState;

  // the event trail's cursor, read just before the spawn or the join
  readonly fromCursor: string;
}

// The adapter's own ID of a session. It never reaches a tool result or a message: the model names a
// session by its short ID.
export interface SessionRef {
  readonly id: string;
}

export interface ReachableSession {
  readonly session: SessionRef;
  readonly target: TargetRef;

  // untrusted
  readonly name: string;

  // untrusted
  readonly cwd: string;
  readonly state: SessionState;
}

// gone: out of sight
export type SessionState = 'running' | 'waiting' | 'idle' | 'ended' | 'gone';

export interface ReadOptions {
  readonly prompt: boolean;

  // 0 for none
  readonly tailTurns: number;
}

export interface SessionRead {
  readonly state: SessionState;

  // untrusted: the text of the session's pending question
  readonly question: string | null;

  // untrusted: the final reply of the session's latest finished turn
  readonly lastReply: string | null;

  // untrusted: the prompt the session was spawned with
  readonly prompt: string | null;

  // [] when tailTurns is 0
  readonly tail: readonly TranscriptTurn[] | 'unsupported';
}

export interface TranscriptTurn {
  // untrusted
  readonly user: string;

  // untrusted
  readonly assistant: string;

  // untrusted
  readonly tools: readonly string[];
}

// Every member also holds the adapter's ID of the session the event belongs to, the event's key,
// which is unique for the adapter, and the time the event happened, as an ISO instant. Every text is
// untrusted.
export type SessionEvent = SessionEventFacts &
  (
    | { readonly kind: 'state'; readonly state: SessionState; readonly question: string | null }
    | { readonly kind: 'answered'; readonly messageRef: string; readonly answer: string }
    | { readonly kind: 'unanswered'; readonly messageRef: string; readonly reason: string }
    | { readonly kind: 'note'; readonly label: NoteLabel; readonly text: string }
  );

interface SessionEventFacts {
  readonly session: string;
  readonly eventKey: string;
  readonly at: string;
}

export type NoteLabel = 'progress' | 'blocked' | 'decision';

// What an adapter call returns to the action queue's attempt, one member per queue outcome.
export type AdapterReply<Value> =
  | { readonly status: 'ok'; readonly value: Value }

  // reason: the system's error code. canClear true: a refusal that may pass, so the queue tries
  // again on its backoff; false: the queue fails the action at once.
  | { readonly status: 'refused'; readonly canClear: boolean; readonly reason: string }

  // the queue's `ambiguous` response
  | { readonly status: 'unknown'; readonly reason: string };

// The session events that wake the conversation.
export type WakeEvent = 'waiting' | 'idle' | 'ended' | 'gone' | 'progress' | 'blocked' | 'decision';

export interface CodingSettings {
  readonly wake: {
    readonly started: readonly WakeEvent[];
    readonly joined: readonly WakeEvent[];
  };

  // the targets nixie lists, joins and starts on
  readonly targets: readonly TargetRef[];

  // a start that names no target takes this one
  readonly defaultTarget: TargetRef;

  // the agent of a start that names none
  readonly agent?: string;

  // how long coding.steer and coding.message wait for their action's outcome before they answer
  // that it is pending
  readonly toolWaitMs: number;
}

export interface CodingContext {
  readonly tasks: TasksContext;
  readonly settings: CodingSettings;
  readonly logEvent: Logger;

  // how the step's messages name the user: the configured name, or "the user"
  readonly ownerName: string;
}

// One row of coding_sessions, parsed.
export interface Binding {
  readonly taskID: string;
  readonly adapter: string;
  readonly sessionID: string;
  readonly origin: SessionOrigin;
  readonly state: SessionState | 'starting';
  readonly wake: readonly WakeEvent[];
  readonly hop: number;
  readonly fromCursor: string;
  readonly lastEventAt: number | null;
  readonly unboundAt: number | null;
  readonly heldAnswers: readonly HeldAnswer[];
}

export type SessionOrigin = 'started' | 'joined';

// An answer that reached the task before the outcome of its note's action: the sequence of the
// trigger.task_input record that holds it.
interface HeldAnswer {
  readonly messageRef: string;
  readonly sequence: number;
}

interface CodingSessionTable {
  readonly task_id: string;
  readonly adapter: string;
  readonly session_id: string;
  readonly origin: SessionOrigin;

  // a SessionState, or 'starting' before the first event
  readonly state: string;

  // JSON: the wake set in force
  readonly wake: string;

  // the hop of the newest steer or note, else of the start
  readonly hop: number;

  // where the catch-up read starts
  readonly from_cursor: string;

  // epoch ms; null before the first event
  readonly last_event_at: number | null;

  // epoch ms when the task let go of the session; null while bound
  readonly unbound_at: number | null;
  readonly updated_sequence: number;

  // JSON: the held answers not yet replied to
  readonly held_answers: string;
}

interface CodingSessionIDTable {
  readonly short_id: string;
  readonly adapter: string;
  readonly session_id: string;
  readonly named_sequence: number;
}

export type CodingTables = CheckedTables<
  Readonly<{ coding_sessions: CodingSessionTable; coding_session_ids: CodingSessionIDTable }>
>;
