import { use, useEffect, useReducer } from 'react';
import type { EventFrom, SnapshotFrom } from 'xstate';
import { initialTransition, transition } from 'xstate';
import { microphoneAccessMachine } from './microphone-access-machine';
import type { Microphone } from './microphone-context';
import { MicrophoneContext } from './microphone-context';

type MicrophoneAccessSnapshot = SnapshotFrom<typeof microphoneAccessMachine>;

type MicrophoneAccessEvent = EventFrom<typeof microphoneAccessMachine>;

export interface MicrophoneAccessState {
  readonly access: MicrophoneAccessSnapshot['value'];
  readonly request: () => void;
}

export function useMicrophoneAccess(): MicrophoneAccessState {
  const microphone = use(MicrophoneContext);

  const [snapshot, send] = useReducer(
    (current: MicrophoneAccessSnapshot, event: MicrophoneAccessEvent) => {
      const [next] = transition(microphoneAccessMachine, current, event);

      return next;
    },
    undefined,
    () => {
      const [initial] = initialTransition(microphoneAccessMachine);

      return initial;
    },
  );

  useEffect(() => {
    const controller = new AbortController();

    void followMicrophonePermission(microphone, send, controller.signal);

    return () => {
      controller.abort();
    };
  }, [microphone]);

  return {
    access: snapshot.value,
    request: () => {
      if (snapshot.can({ type: 'request' })) {
        send({ type: 'request' });
        void runMicrophoneRequest(microphone, send);
      }
    },
  };
}

async function followMicrophonePermission(
  microphone: Microphone,
  send: (event: MicrophoneAccessEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!microphone.hasMediaDevices()) {
    send({ type: 'unavailable' });

    return;
  }

  const permission = await microphone.queryPermission();

  if (signal.aborted) {
    return;
  }

  send({ type: 'permission.read', state: permission?.state ?? null });

  permission?.addEventListener(
    'change',
    () => {
      send({ type: 'permission.changed', state: permission.state });
    },
    { signal },
  );
}

async function runMicrophoneRequest(
  microphone: Microphone,
  send: (event: MicrophoneAccessEvent) => void,
): Promise<void> {
  try {
    const stream = await microphone.openMedia({ audio: true });

    for (const track of stream.getTracks()) {
      track.stop();
    }

    send({ type: 'request.granted' });

    return;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') {
      send({ type: 'request.failed' });

      return;
    }
  }

  // Chrome refuses with NotAllowedError both when the user blocks the site and when they only
  // close the prompt, and only the permission tells the two apart.
  const permission = await microphone.queryPermission();

  send({ type: 'request.refused', state: permission?.state ?? null });
}
