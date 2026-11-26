import type { ContractClient } from '@heynixie/contract';
import { P, match } from 'ts-pattern';
import type { StartTimer } from '../utils/start-platform-timer';
import type { CallEnvironment, CallMicrophone, CallPeer } from './call-environment';
import { isCallError } from './is-call-error';
import { pickMicrophoneRefusal } from './pick-microphone-refusal';
import { pickStartRefusal } from './pick-start-refusal';
import type { CallSnapshot, CallView } from './types';

// the pause before the device sends its new offer again, while the server still waits for one
const retryMs = 2000;

// how long a lost connection may take to come back before the call is given up
const reconnectLimitMs = 30_000;

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

  // stops the microphone and the peer, for a page that goes away with the call still open
  readonly dispose: () => void;
}

const idleSnapshot: CallSnapshot = {
  phase: 'idle',
  callID: null,
  thread: null,
  isMuted: false,
  connection: 'new',
  startedAtMs: null,
  reconnectedAtMs: null,
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

  // true once the current reconnect's new offer has its answer in place
  let isRestartAnswered = false;

  // the start that is running, which a hang-up waits for once the server has the request
  let pendingStart: Promise<void> | null = null;

  // true from the first hang-up of the user on, so a second one sends nothing
  let hasHungUp = false;

  // stops the reconnect's 30 s limit, which holds until the connection is back
  let stopDeadline: (() => void) | null = null;

  // Counts each release of the microphone and the peer, so an answer that arrives after a hang-up,
  // an end or a give-up finds the call changed and does nothing.
  let epoch = 0;

  const change = (patch: Partial<CallSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };

    for (const listener of listeners) {
      listener();
    }
  };

  const release = (): void => {
    epoch += 1;

    if (microphone !== null) {
      stopTracks(microphone);
    }

    microphone = null;
    peer?.close();
    peer = null;
    isReconnecting = false;
    isRestartAnswered = false;
    stopDeadline?.();
    stopDeadline = null;
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

      if (state === 'connected' && isRestartAnswered && snapshot.phase === 'reconnecting') {
        settleReconnect();
      }

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

  // The call is back once the new offer has its answer and the connection is up.
  const settleReconnect = (): void => {
    stopDeadline?.();
    stopDeadline = null;
    isRestartAnswered = false;

    change({
      phase: 'live',
      connection: peer?.readConnectionState() ?? 'new',
      reconnectedAtMs: dependencies.now(),
    });
  };

  // Gives up a call that did not come back in time, and ends it on the server when it still runs.
  const giveUp = async (callID: string): Promise<void> => {
    finish('dropped');

    await hangUpQuietly(dependencies.calls, callID);
  };

  // Sends a new offer on the open peer connection, so the microphone and the audio path stay. The
  // call is given up when the connection is not back within the limit.
  const reconnect = async (): Promise<void> => {
    if (hasHungUp || isReconnecting || snapshot.callID === null || snapshot.phase === 'ended') {
      return;
    }

    isReconnecting = true;

    const callID = snapshot.callID;
    const mine = epoch;

    isRestartAnswered = false;

    change({ phase: 'reconnecting' });

    // the limit counts from the first loss, so a connection that fails again keeps the same one
    stopDeadline ??= dependencies.startTimer(() => {
      if (epoch === mine) {
        void giveUp(callID);
      }
    }, reconnectLimitMs);

    await retryOffers(callID, mine);
  };

  const retryOffers = async (callID: string, mine: number): Promise<void> => {
    for (;;) {
      if (epoch !== mine) {
        return;
      }

      const target = resolvePeerToRestart();

      try {
        const sdpOffer = await target.makeOffer({ isRestart: true });
        const answer = await dependencies.calls.connect({ callID, sdpOffer });

        if (epoch !== mine) {
          return;
        }

        await target.applyAnswer(answer.sdpAnswer);

        if (epoch !== mine) {
          return;
        }

        isReconnecting = false;

        // a same-peer restart can still report the connected state from before the loss, so only a
        // state change that follows the answer settles the call
        isRestartAnswered = true;

        return;
      } catch (error) {
        if (epoch !== mine) {
          return;
        }

        // the call is no longer this device's to bring back
        if (isCallError(error, ['CALL_NOT_FOUND', 'NOT_CARRYING_SESSION'])) {
          finish('dropped');

          return;
        }

        // any other refusal, a held session included, is tried again after a pause: the call is
        // live only once an answer is in place
        await new Promise<void>((resolve) => {
          dependencies.startTimer(resolve, retryMs);
        });
      }
    }
  };

  const start = (): Promise<void> => {
    if (snapshot.phase !== 'idle') {
      return Promise.resolve();
    }

    const running = runStart();

    pendingStart = running;

    return running;
  };

  const runStart = async (): Promise<void> => {
    change({ phase: 'asking' });

    const mine = epoch;
    let opened: CallMicrophone;

    try {
      opened = await dependencies.environment.openMicrophone();
    } catch (error) {
      if (epoch === mine) {
        change({ phase: 'refused', refusal: pickMicrophoneRefusal(error) });
      }

      return;
    }

    if (epoch !== mine) {
      stopTracks(opened);

      return;
    }

    microphone = opened;

    change({ phase: 'starting' });

    let started: Awaited<ReturnType<typeof dependencies.calls.start>>;

    try {
      started = await dependencies.calls.start({ clientActionID: crypto.randomUUID() });
    } catch (error) {
      if (epoch === mine) {
        release();
        change({ phase: 'refused', refusal: pickStartRefusal(error) });
      }

      return;
    }

    if (epoch !== mine) {
      await hangUpQuietly(dependencies.calls, started.callID);

      return;
    }

    change({ phase: 'connecting', callID: started.callID, thread: started.thread });

    try {
      const target = openPeer();

      const sdpOffer = await target.makeOffer({ isRestart: false });
      const answer = await dependencies.calls.connect({ callID: started.callID, sdpOffer });

      if (epoch !== mine) {
        return;
      }

      await target.applyAnswer(answer.sdpAnswer);
    } catch (error) {
      // a hang-up or an end while the connect was pending already ended the call
      if (epoch !== mine) {
        return;
      }

      release();
      change({ phase: 'refused', refusal: pickStartRefusal(error) });

      await hangUpQuietly(dependencies.calls, started.callID);

      return;
    }

    if (epoch !== mine) {
      return;
    }

    change({
      phase: 'live',
      startedAtMs: dependencies.now(),
      connection: peer?.readConnectionState() ?? 'new',
    });
  };

  const hasEnded = (): boolean => snapshot.phase === 'ended';

  const hangUp = async (): Promise<void> => {
    const callID = snapshot.callID;

    if (callID === null) {
      // a call that has no ID yet: its microphone closes now, and a start that is still pending
      // finds the call changed and ends the call it opens
      if (snapshot.phase === 'asking' || snapshot.phase === 'starting') {
        const isRequestSent = snapshot.phase === 'starting';

        release();

        snapshot = idleSnapshot;

        change({});

        // the server may open the call behind the request, so the hang-up settles once the start
        // has ended it
        if (isRequestSent) {
          await pendingStart;
        }
      }

      return;
    }

    if (snapshot.phase === 'ended' || hasHungUp) {
      return;
    }

    // Everything pending settles against a released call from here on, so no answer or refusal
    // that arrives while the request runs changes the call or reaches the closed peer.
    hasHungUp = true;

    release();

    let endedBy: CallSnapshot['endedBy'] = 'you';

    try {
      const reply = await dependencies.calls.hangUp({
        callID,
        clientActionID: crypto.randomUUID(),
      });

      // the reply says who ended the call, so a call the server ended first keeps its own reason
      endedBy = reply.endedBy;
    } finally {
      // an end that the live read reported meanwhile keeps its reason too
      if (!hasEnded()) {
        finish(endedBy);
      }
    }
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
    dispose: release,
    dismiss: () => {
      if (snapshot.phase === 'ended' || snapshot.phase === 'refused') {
        snapshot = idleSnapshot;
        hasHungUp = false;

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
          if (snapshot.phase === 'live' && !hasHungUp) {
            void reconnect();
          }
        })
        .otherwise(() => {});
    },
  };
}

function stopTracks(source: CallMicrophone): void {
  for (const track of source.getTracks()) {
    track.stop();
  }
}

// A call that never connected, or that this device gave up, is ended, so no call is left to wait
// out its limit.
async function hangUpQuietly(calls: ContractClient['calls'], callID: string): Promise<void> {
  try {
    await calls.hangUp({ callID, clientActionID: crypto.randomUUID() });
  } catch {
    // the server's own limit ends the call
  }
}
