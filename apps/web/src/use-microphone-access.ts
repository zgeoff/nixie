import { useEffect, useState } from 'react';
import { match } from 'ts-pattern';

type MicrophoneAccess =
  | 'checking'
  | 'not-asked'
  | 'asking'
  | 'on'
  | 'blocked'
  | 'failed'
  | 'unavailable';

export interface MicrophoneAccessState {
  readonly access: MicrophoneAccess;
  readonly request: () => void;
}

export function useMicrophoneAccess(): MicrophoneAccessState {
  const [access, setAccess] = useState<MicrophoneAccess>('checking');

  useEffect(() => {
    const controller = new AbortController();

    void followMicrophonePermission(setAccess, controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  const requestAccess = async (): Promise<void> => {
    setAccess('asking');

    const answered = await runMicrophoneRequest();

    setAccess(answered);
  };

  return {
    access,
    request: () => {
      void requestAccess();
    },
  };
}

async function followMicrophonePermission(
  onAccess: (access: MicrophoneAccess) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!('mediaDevices' in globalThis.navigator)) {
    onAccess('unavailable');

    return;
  }

  const permission = await readMicrophonePermission();

  if (signal.aborted) {
    return;
  }

  if (permission === null) {
    onAccess('not-asked');

    return;
  }

  onAccess(toMicrophoneAccess(permission.state));

  permission.addEventListener(
    'change',
    () => {
      onAccess(toMicrophoneAccess(permission.state));
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

function toMicrophoneAccess(state: PermissionState): MicrophoneAccess {
  return match(state)
    .returnType<MicrophoneAccess>()
    .with('granted', () => 'on')
    .with('denied', () => 'blocked')
    .with('prompt', () => 'not-asked')
    .exhaustive();
}

async function runMicrophoneRequest(): Promise<MicrophoneAccess> {
  try {
    const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });

    for (const track of stream.getTracks()) {
      track.stop();
    }

    return 'on';
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') {
      return 'failed';
    }
  }

  // Chrome refuses with NotAllowedError both when the user blocks the site and when they only
  // close the prompt, and only the permission tells the two apart.
  const permission = await readMicrophonePermission();

  return permission === null ? 'blocked' : toMicrophoneAccess(permission.state);
}
