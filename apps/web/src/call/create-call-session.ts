import type { ContractClient } from '@heynixie/contract';
import { P, match } from 'ts-pattern';
import type { StartTimer } from '../utils/start-platform-timer';
import type { CallEnvironment, CallMicrophone, CallPeer } from './call-environment';
import { isCallError } from './is-call-error';
import { pickMicrophoneRefusal } from './pick-microphone-refusal';
import { pickStartRefusal } from './pick-start-refusal';
import type { CallPhase, CallSnapshot, CallView } from './types';

// the pause before the device sends its new offer again, while the server still waits for one
const retryMs = 2000;

export interface CallSessionDependencies {
  readonly calls: ContractClient['calls'];
  readonly environment: CallEnvironment;
  readonly startTimer: StartTimer;
  readonly now: () => number;
}

export interface CallSession {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => CallSnapshot;
  readonly start: () => Promise<void>;
  readonly hangUp: () => Promise<void>;
  readonly toggleMute: () => void;

  // forgets an ended or refused call, so the screen offers a new one
  readonly dismiss: () => void;

  // takes what the server says of the call: that it ended, or that it waits for a new offer
  readonly observe: (view: CallView) => void;
}

const idleSnapshot: CallSnapshot = {
  phase: 'idle',
  callID: null,
  thread: null,
  isMuted: false,
  connection: 'new',
  startedAtMs: null,
  endedBy: null,
  refusal: null,
  remoteStream: null,
};

// One call of this device: its microphone, its peer connection to the speech layer, and its state.
// It lives above the router, so a route change never ends the call.
export function createCallSession(dependencies: CallSessionDependencies): CallSession {
  const listeners = new Set<() => void>();

  let snapshot = idleSnapshot;
  let microphone: CallMicrophone | null = null;
  let peer: CallPeer | null = null;
  let isReconnecting = false;
  const readPhase = (): CallPhase => snapshot.phase;

  const change = (patch: Partial<CallSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };

    for (const listener of listeners) {
      listener();
    }
  };

  const release = (): void => {
    for (const track of microphone?.getTracks() ?? []) {
      track.stop();
    }

    microphone = null;
    peer?.close();
    peer = null;
    isReconnecting = false;
  };

  const finish = (endedBy: CallSnapshot['endedBy']): void => {
    release();
    change({ phase: 'ended', endedBy, connection: 'closed', remoteStream: null });
  };

  const openPeer = (): CallPeer => {
    const opened = dependencies.environment.createPeer();

    if (microphone !== null) {
      for (const track of microphone.getTracks()) {
        opened.addTrack(track, microphone);
      }
    }

    opened.onSpeech((stream) => {
      change({ remoteStream: stream });
    });

    opened.onConnectionState((state) => {
      if (peer !== opened) {
        return;
      }

      change({ connection: state });

      if (state === 'failed') {
        void reconnect();
      }
    });

    peer = opened;

    return opened;
  };

  // A connection that failed or closed can no longer restart, so it gets a new peer.
  const resolvePeerToRestart = (): CallPeer => {
    if (peer === null) {
      return openPeer();
    }

    const state = peer.readConnectionState();

    if (state !== 'failed' && state !== 'closed') {
      return peer;
    }

    peer.close();

    return openPeer();
  };

  // Sends a new offer on the open peer connection, so the microphone and the audio path stay.
  const reconnect = async (): Promise<void> => {
    if (isReconnecting || snapshot.callID === null || snapshot.phase === 'ended') {
      return;
    }

    isReconnecting = true;

    const callID = snapshot.callID;

    change({ phase: 'reconnecting' });

    for (;;) {
      const target = resolvePeerToRestart();

      try {
        const sdpOffer = await target.makeOffer({ isRestart: true });
        const answer = await dependencies.calls.connect({ callID, sdpOffer });

        await target.applyAnswer(answer.sdpAnswer);

        isReconnecting = false;

        change({ phase: 'live', connection: target.readConnectionState() });

        return;
      } catch (error) {
        if (
          readPhase() === 'ended' ||
          isCallError(error, ['CALL_NOT_FOUND', 'NOT_CARRYING_SESSION'])
        ) {
          return;
        }

        if (isCallError(error, ['CALL_CONNECTED'])) {
          // the server already holds a session from an earlier offer, so this one is withdrawn
          await target.dropOffer();

          isReconnecting = false;

          change({ phase: 'live', connection: target.readConnectionState() });

          return;
        }

        await new Promise<void>((resolve) => {
          dependencies.startTimer(resolve, retryMs);
        });

        if (readPhase() === 'ended') {
          return;
        }
      }
    }
  };

  const start = async (): Promise<void> => {
    if (snapshot.phase !== 'idle') {
      return;
    }

    change({ phase: 'asking' });

    try {
      microphone = await dependencies.environment.openMicrophone();
    } catch (error) {
      change({ phase: 'refused', refusal: pickMicrophoneRefusal(error) });

      return;
    }

    change({ phase: 'starting' });

    let started: Awaited<ReturnType<typeof dependencies.calls.start>>;

    try {
      started = await dependencies.calls.start({ clientActionID: crypto.randomUUID() });
    } catch (error) {
      release();
      change({ phase: 'refused', refusal: pickStartRefusal(error) });

      return;
    }

    change({ phase: 'connecting', callID: started.callID, thread: started.thread });

    try {
      const target = openPeer();

      const sdpOffer = await target.makeOffer({ isRestart: false });
      const answer = await dependencies.calls.connect({ callID: started.callID, sdpOffer });

      await target.applyAnswer(answer.sdpAnswer);
    } catch (error) {
      release();
      change({ phase: 'refused', refusal: pickStartRefusal(error) });

      await endUnconnectedCall(dependencies.calls, started.callID);

      return;
    }

    change({
      phase: 'live',
      startedAtMs: dependencies.now(),
      connection: peer?.readConnectionState() ?? 'new',
    });
  };

  const hangUp = async (): Promise<void> => {
    const callID = snapshot.callID;

    if (callID === null || snapshot.phase === 'ended') {
      return;
    }

    await dependencies.calls.hangUp({ callID, clientActionID: crypto.randomUUID() });

    finish('you');
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);

      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
    start,
    hangUp,
    toggleMute: () => {
      const isMuted = !snapshot.isMuted;

      for (const track of microphone?.getTracks() ?? []) {
        track.enabled = !isMuted;
      }

      change({ isMuted });
    },
    dismiss: () => {
      if (snapshot.phase === 'ended' || snapshot.phase === 'refused') {
        snapshot = idleSnapshot;

        change({});
      }
    },
    observe: (view) => {
      match(view)
        .with({ state: 'ended' }, (ended) => {
          if (snapshot.phase !== 'ended') {
            finish(ended.endedBy);
          }
        })
        .with({ state: 'live', reconnect: P.not(null) }, () => {
          if (snapshot.phase === 'live') {
            void reconnect();
          }
        })
        .otherwise(() => {});
    },
  };
}

// A call that never connected is ended, so no call is left to wait out its limit.
async function endUnconnectedCall(calls: ContractClient['calls'], callID: string): Promise<void> {
  try {
    await calls.hangUp({ callID, clientActionID: crypto.randomUUID() });
  } catch {
    // the server's own limit ends the call
  }
}
