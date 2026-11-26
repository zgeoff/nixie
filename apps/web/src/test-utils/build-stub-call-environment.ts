import type { CallEnvironment, CallPeer, CallTrack, OfferOptions } from '../call/call-environment';

export interface StubCallPeer extends CallPeer {
  readonly offers: readonly OfferOptions[];
  readonly answers: readonly string[];
  readonly emitConnectionState: (state: RTCPeerConnectionState) => void;
  readonly isClosed: () => boolean;
}

export interface StubCallEnvironment {
  readonly environment: CallEnvironment;
  readonly peers: readonly StubCallPeer[];
  readonly tracks: readonly CallTrack[];
  readonly microphoneRequests: () => number;

  // how many tracks the call has stopped
  readonly stoppedTracks: () => number;
}

export interface StubCallEnvironmentOptions {
  // the error the microphone request fails with, or null for one that works
  readonly microphoneError: Error | null;
}

// A microphone with one track and peer connections that only record what a call does to them. A
// peer's nth offer is `offer-<n>`, and its connection state follows `emitConnectionState`.
export function buildStubCallEnvironment(options: StubCallEnvironmentOptions): StubCallEnvironment {
  const peers: StubCallPeer[] = [];
  const tracks: CallTrack[] = [];
  const counts = { microphoneRequests: 0, stoppedTracks: 0 };

  const environment: CallEnvironment = {
    openMicrophone: () => {
      counts.microphoneRequests += 1;

      if (options.microphoneError !== null) {
        return Promise.reject(options.microphoneError);
      }

      const track: CallTrack = {
        enabled: true,
        stop: () => {
          counts.stoppedTracks += 1;
        },
      };

      tracks.push(track);

      return Promise.resolve({ getTracks: () => [track] });
    },
    createPeer: () => {
      const peer = buildStubPeer();

      peers.push(peer);

      return peer;
    },
  };

  return {
    environment,
    peers,
    tracks,
    microphoneRequests: () => counts.microphoneRequests,
    stoppedTracks: () => counts.stoppedTracks,
  };
}

function buildStubPeer(): StubCallPeer {
  const offers: OfferOptions[] = [];
  const answers: string[] = [];
  const listeners: ((state: RTCPeerConnectionState) => void)[] = [];

  const state: { isClosed: boolean; connection: RTCPeerConnectionState } = {
    isClosed: false,
    connection: 'new',
  };

  return {
    offers,
    answers,
    readConnectionState: () => state.connection,
    addTrack: () => {},
    makeOffer: (offerOptions) => {
      offers.push(offerOptions);

      return Promise.resolve(`offer-${String(offers.length)}`);
    },
    applyAnswer: (sdp) => {
      answers.push(sdp);

      return Promise.resolve();
    },
    onSpeech: () => {},
    onConnectionState: (listener) => {
      listeners.push(listener);
    },
    close: () => {
      state.isClosed = true;
    },
    emitConnectionState: (next) => {
      state.connection = next;

      for (const listener of listeners) {
        listener(next);
      }
    },
    isClosed: () => state.isClosed,
  };
}
