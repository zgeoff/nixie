import type { SpeechEvent } from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';

// What the adapter needs of the credential store's socket: the shape of `CredentialSocket`.
export interface SidebandSocket {
  readonly send: (text: string) => void;
  readonly messages: AsyncIterable<string>;
  readonly close: () => void;
}

// The shape of `CredentialSocketOpener`: it adds the API key to the handshake on the host.
export type OpenSideband = (url: string) => Promise<SidebandSocket>;

export interface GPTLiveOptions {
  // adds the API key on the host, so the adapter holds none
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly openSideband: OpenSideband;

  // the API's base URL, such as https://api.openai.com
  readonly apiURL: string;

  // the provider's model, such as gpt-live-1
  readonly model: string;
  readonly clock: Clock;
  readonly logEvent: Logger;
}

// A piece of the user's speech or of GPT-Live's, on the session's own timeline.
export interface TranscriptSlice {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

// The line that GPT-Live is speaking from a commentary the adapter sent.
export interface SpokenLine {
  readonly kind: 'answer' | 'say';
  readonly eventID: string;

  // the delegation of an answer
  readonly handOffID: string | null;

  // the text the adapter sent, which a cut is counted against
  readonly sentText: string;

  // null until the provider acknowledges the commentary, which gives its start on the timeline
  startMs: number | null;
  isPlaying: boolean;
  isCut: boolean;
  readonly spoken: TranscriptSlice[];
}

export interface GPTLiveSession {
  readonly sessionID: string;
  readonly socket: SidebandSocket;

  // the events that the session has raised and nobody has read
  readonly queue: SpeechEvent[];
  readonly waiters: ((event: SpeechEvent | null) => void)[];
  readonly seenEventIDs: Set<string>;

  // the user's speech since the last hand-off
  requestSlices: TranscriptSlice[];

  // the user's speech that no `heard` event holds yet
  heardSlices: TranscriptSlice[];

  // GPT-Live's own speech that no `spoke` event holds yet
  talkSlices: TranscriptSlice[];
  lines: SpokenLine[];

  // commentaries sent and not yet acknowledged
  unacknowledged: number;
  lastOutputAtMs: number;
  nextEventNumber: number;
  isClosed: boolean;
  isClosing: boolean;
  readonly inputQuiet: { current: AbortController | null };
  readonly outputQuiet: { current: AbortController | null };
  readonly expiry: { current: AbortController | null };
  readonly stopping: AbortController;
}
