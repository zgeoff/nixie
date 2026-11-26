type CallPhase =
  | 'idle'
  | 'asking'
  | 'starting'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'ended'
  | 'refused';

export type CallRefusal =
  | 'microphone-blocked'
  | 'microphone-missing'
  | 'microphone-failed'
  | 'voice-off'
  | 'speech-unavailable'
  | 'price-missing'
  | 'call-running'
  | 'budget-reached'
  | 'credential-refused'
  | 'failed';

export type CallEndedBy = 'you' | 'nixie' | 'budget' | 'missed' | 'declined' | 'dropped';

export interface CallSnapshot {
  readonly phase: CallPhase;
  readonly callID: string | null;

  // the call's own thread, which its proposals sit on
  readonly thread: string | null;
  readonly isMuted: boolean;

  // the peer connection's state, or 'new' while there is none
  readonly connection: RTCPeerConnectionState;
  readonly startedAtMs: number | null;

  // when the last reconnect finished, so a read of the call from before it is no longer true
  readonly reconnectedAtMs: number | null;
  readonly endedBy: CallEndedBy | null;
  readonly refusal: CallRefusal | null;

  // the speech layer's voice, which the provider plays through its audio element
  readonly remoteStream: MediaStream | null;
}

// what the carrying device reads of a call from the server
export interface CallView {
  readonly state: 'ringing' | 'connecting' | 'live' | 'ended';
  readonly endedBy: CallEndedBy | null;
  readonly reconnect: 'session_limit' | 'dropped' | 'restart' | null;
}
