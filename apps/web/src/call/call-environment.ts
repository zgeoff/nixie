import { createContext } from 'react';
import { createBrowserPeer } from './create-browser-peer';

export interface CallTrack {
  enabled: boolean;
  readonly stop: () => void;
}

export interface CallMicrophone {
  readonly getTracks: () => readonly CallTrack[];
}

export interface OfferOptions {
  // restarts the connection's network path on the same peer connection
  readonly isRestart: boolean;
}

// The part of a peer connection that a call uses. Each offer waits for the connection to gather its
// network addresses, because the speech layer takes no later ones.
export interface CallPeer {
  readonly readConnectionState: () => RTCPeerConnectionState;
  readonly addTrack: (track: CallTrack, stream: CallMicrophone) => void;
  readonly makeOffer: (options: OfferOptions) => Promise<string>;
  readonly applyAnswer: (sdp: string) => Promise<void>;
  readonly onSpeech: (listener: (stream: MediaStream) => void) => void;
  readonly onConnectionState: (listener: (state: RTCPeerConnectionState) => void) => void;
  readonly close: () => void;
}

// What a call takes from the browser: the microphone, and a peer connection to the speech layer.
export interface CallEnvironment {
  // asks for the microphone with the browser's echo cancellation on
  readonly openMicrophone: () => Promise<CallMicrophone>;
  readonly createPeer: () => CallPeer;
}

const browserCallEnvironment: CallEnvironment = {
  openMicrophone: () =>
    globalThis.navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }),
  createPeer: createBrowserPeer,
};

export const CallEnvironmentContext = createContext<CallEnvironment>(browserCallEnvironment);
