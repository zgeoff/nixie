// One spoken turn with a speech-to-speech API: the runner streams the caller's audio in, and the
// call keeps every chunk of reply audio with the time it arrived.
export interface ReceivedAudio {
  at: number;
  samples: Float32Array;
}

export interface VoiceCall {
  appendAudio: (window: Float32Array) => void;
  close: () => void;
  // Settles once the reply is over, or rejects on an API error.
  ended: Promise<void>;
  heard: () => string;
  ready: Promise<void>;
  received: ReceivedAudio[];
  said: () => string;
  // When the API told the client to drop the reply audio it holds but has not played. An API that
  // stops its own stream when the caller speaks sends no such signal.
  stopPlaybackAt: number[];
  toolCalls: string[];
}
