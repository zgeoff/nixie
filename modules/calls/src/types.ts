import type { BudgetsContext } from '@heynixie/budgets';
import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { Transaction } from 'kysely';
import type { VoiceConfig } from './config/voice-config-schema';
import type { CallEndedBy } from './utils/call-ended-by';

export type CallState = 'ringing' | 'connecting' | 'live' | 'ended';

type CallStartedBy = 'you' | 'nixie';

// The speech layer is the outside service that hears the user, takes turns and speaks.
export interface SpeechLayer {
  // the provider's model that speaks the call, which each `call.spoke` record names
  readonly model: string;

  // Creates the session from the device's offer and opens the sideband. The session sets
  // `store: false`, client delegation, an acknowledgement delay, and a device data channel that
  // may receive and send no event.
  readonly open: (input: OpenSpeech) => Promise<OpenedSpeech | SpeechRefused>;

  // Sends nixie's whole answer for a hand-off; the speech layer speaks it in its own words. The
  // text is never empty. A hand-off never closes on the provider's side: `final` marks the end
  // inside nixie, and the calls module always sends `true`.
  readonly answer: (
    sessionID: string,
    handOffID: string,
    text: string,
    final: boolean,
  ) => Promise<void>;

  // Sends a line for the speech layer to say now, such as the reconnect line.
  readonly say: (sessionID: string, text: string) => Promise<void>;
  readonly close: (sessionID: string) => Promise<void>;
  readonly events: (sessionID: string) => AsyncIterable<SpeechEvent>;
}

export interface OpenSpeech {
  readonly sdpOffer: string;

  // The voice-call prompt, then the call's recent lines. Never a memory block.
  readonly instructions: string;

  // from the voice definitions
  readonly voice: string;
}

export interface OpenedSpeech {
  readonly sdpAnswer: string;
  readonly sessionID: string;
}

export interface SpeechRefused {
  readonly error: 'VOICE_CREDENTIAL_REFUSED' | 'SPEECH_UNAVAILABLE';
}

// `heard` is the user's speech, as the input transcript's slices up to a hand-off's offset or up to
// 1 s of quiet. `spoke` is the speech layer's own small talk. `hand_off` carries the user's speech
// since the last hand-off, and `cut` marks a reply that the user talked over.
export type SpeechEvent =
  | {
      readonly kind: 'heard';
      readonly text: string;
      readonly startedAtMs: number;
      readonly endedAtMs: number;
    }
  | { readonly kind: 'spoke'; readonly text: string; readonly heardChars: number }
  | { readonly kind: 'hand_off'; readonly handOffID: string; readonly request: string }
  | { readonly kind: 'cut'; readonly handOffID: string; readonly heardChars: number }
  | { readonly kind: 'session_ending' }
  | { readonly kind: 'dropped' };

export interface VoiceLines {
  readonly holding: string;
  readonly reconnect: string;
  readonly couldntFinish: string;
  readonly budget: string;
}

// What the `voice/` files of the definitions in force say.
export interface VoiceDefinitions {
  readonly voice: string;

  // how long a hand-off waits for nixie's answer before the speech layer says the holding line
  readonly holdAfterMs: number;

  // null when `voice/voice.yaml` sets no price, or no valid one
  readonly pricePerMinuteMicros: number | null;
  readonly lines: VoiceLines;
}

export interface CreateCallTask {
  readonly callID: string;

  // the last conversation sequence that the call's session opens with
  readonly seedThrough: number;
}

// What the calls module keeps in memory for the calls that run in this process.
export interface CallRuntime {
  // stops each call's watch of its speech session, by call ID
  readonly watches: Map<string, AbortController>;

  // the hand-offs of each call, by call ID and hand-off ID
  readonly handOffs: Map<string, Map<string, HandOff>>;

  // the speech layer's own lines since the call's last hand-off, by call ID
  readonly smallTalk: Map<string, SmallTalkLine[]>;

  // the calls whose turn asked to hang up, which end once the turn's answer is sent
  readonly hangUps: Set<string>;
}

export interface HandOff {
  // set once the module has sent nixie's answer for the hand-off
  isAnswered: boolean;

  // the record that holds the answered reply, which a cut marks
  replyRecordID: string | null;

  // cancels the holding line's timer
  readonly holding: AbortController;
}

export interface SmallTalkLine {
  readonly text: string;
  readonly heardChars: number;
}

export interface CallsContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly logEvent: Logger;
  readonly budgets: BudgetsContext;

  // the `voice` config section, or null without it, which turns calls off
  readonly voice: VoiceConfig | null;

  // the adapter that reaches the speech provider, or null when the server holds none
  readonly speech: SpeechLayer | null;
  readonly readVoiceDefinitions: () => VoiceDefinitions;

  // Creates the task that holds the call's thread, in the transaction that opens the call, and
  // returns its ID.
  readonly createTask: (tx: Transaction<unknown>, input: CreateCallTask) => Promise<string>;

  // the speech session's instructions at connect
  readonly readInstructions: (callID: string) => Promise<string>;

  // Interrupts the turn that the call's task runs, so that the user talking over a reply cuts a
  // model call in flight.
  readonly interruptTurn: (taskID: string) => Promise<void>;

  // Writes the call's report to the conversation in the transaction that ends the call, when the
  // call's task can run no closing turn, and returns whether it wrote one.
  readonly writeStrandedReport: (
    tx: Transaction<unknown>,
    call: Pick<Call, 'callID' | 'taskID'>,
  ) => Promise<boolean>;
  readonly runtime: CallRuntime;

  // the speech sessions of the calls that run in this process, by call ID
  readonly sessions: Map<string, string>;

  // the calls whose speech session is opening in this process, so one connect at a time opens
  readonly openings: Set<string>;
}

export interface CallRow {
  readonly call_id: string;
  readonly task_id: string;
  readonly state: string;
  readonly started_by: string;
  readonly carrying_session: string;
  readonly started_at: number;
  readonly connected_at: number | null;
  readonly ended_at: number | null;
  readonly ended_by: string | null;
  readonly minutes: number;
  readonly updated_sequence: number;
}

export type CallsTables = CheckedTables<Readonly<{ calls: CallRow }>>;

export interface Call {
  readonly callID: string;
  readonly taskID: string;
  readonly state: CallState;
  readonly startedBy: CallStartedBy;
  readonly carryingSession: string;
  readonly startedAtMs: number;
  readonly connectedAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly endedBy: CallEndedBy | null;
  readonly minutes: number;
}
