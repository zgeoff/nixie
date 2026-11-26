import type { SpeechEvent } from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';

// What the adapter needs of the credential store's socket: the shape of `CredentialSocket`.
export interface SidebandSocket {
  readonly send: (text: string) => void;
  readonly messages: AsyncIterable<string>;
  readonly close: () => void;
}

// The shape of `CredentialFetcher`: the fetcher adds the API key to a request, and its socket opener
// adds it to the handshake, both on the host, so the adapter holds none.
export type GPTLiveFetcher = ((input: string, init?: RequestInit) => Promise<Response>) & {
  readonly openSocket: (url: string, init?: SidebandInit) => Promise<SidebandSocket>;
};

export interface SidebandInit {
  readonly signal?: AbortSignal;
}

export interface GPTLiveOptions {
  readonly fetch: GPTLiveFetcher;

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

  // a cut has begun, and waits for the transcript of the last words
  isCutting: boolean;

  // the cut has been raised, so the line's later speech is no longer its own
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

  // the client event IDs of the commentaries sent and not yet acknowledged or refused
  readonly pendingEventIDs: Set<string>;
  lastOutputAtMs: number;
  nextEventNumber: number;
  isClosed: boolean;
  isClosing: boolean;
  readonly inputQuiet: { current: AbortController | null };
  readonly outputQuiet: { current: AbortController | null };
  readonly expiry: { current: AbortController | null };
  readonly stopping: AbortController;
}
