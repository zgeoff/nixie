import { useEffect, useReducer } from 'react';
import type { EventFrom, SnapshotFrom } from 'xstate';
import { initialTransition, transition } from 'xstate';
import { microphoneAccessMachine } from './microphone-access-machine';

type MicrophoneAccessSnapshot = SnapshotFrom<typeof microphoneAccessMachine>;

type MicrophoneAccessEvent = EventFrom<typeof microphoneAccessMachine>;

export interface MicrophoneAccessState {
  readonly access: MicrophoneAccessSnapshot['value'];
  readonly request: () => void;
}

export function useMicrophoneAccess(): MicrophoneAccessState {
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

    void followMicrophonePermission(send, controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  return {
    access: snapshot.value,
    request: () => {
      if (snapshot.can({ type: 'request' })) {
        send({ type: 'request' });
        void runMicrophoneRequest(send);
      }
    },
  };
}

async function followMicrophonePermission(
  send: (event: MicrophoneAccessEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!('mediaDevices' in globalThis.navigator)) {
    send({ type: 'unavailable' });

    return;
  }

  const permission = await readMicrophonePermission();

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

async function readMicrophonePermission(): Promise<PermissionStatus | null> {
  if (!('permissions' in globalThis.navigator)) {
    return null;
  }

  try {
    return await globalThis.navigator.permissions.query({ name: 'microphone' });
  } catch {
    // Some browsers refuse a query for the microphone permission with a TypeError.
    return null;
  }
}

async function runMicrophoneRequest(send: (event: MicrophoneAccessEvent) => void): Promise<void> {
  try {
    const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

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
  const permission = await readMicrophonePermission();

  send({ type: 'request.refused', state: permission?.state ?? null });
}
