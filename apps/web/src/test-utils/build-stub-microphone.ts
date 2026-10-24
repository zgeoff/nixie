import type { Microphone, MicrophonePermission, MicrophoneStream } from '../microphone-context';

type StubMicrophoneAnswer = 'allow' | 'block' | 'dismiss' | 'missing';

export interface StubMicrophoneOptions {
  readonly permission: PermissionState | 'unsupported';
  readonly answer: StubMicrophoneAnswer;

  readonly hasMediaDevices?: boolean;
}

interface StubTrack {
  readonly kind: 'audio';
  readyState: MediaStreamTrackState;
  readonly stop: () => void;
}

export interface StubMicrophone {
  readonly microphone: Microphone;
  readonly readRequests: () => readonly MediaStreamConstraints[];
  readonly readTracks: () => readonly StubTrack[];
  readonly setPermission: (state: PermissionState) => void;
}

interface StubPermission extends MicrophonePermission {
  state: PermissionState;
}

// The answers follow Chrome's: a refusal is a NotAllowedError whether the user blocks the prompt or
// closes it, and only a block changes the permission.
export function buildStubMicrophone(options: StubMicrophoneOptions): StubMicrophone {
  const requests: MediaStreamConstraints[] = [];
  const tracks: StubTrack[] = [];
  const permissions: StubPermission[] = [];

  let permission: PermissionState =
    options.permission === 'unsupported' ? 'prompt' : options.permission;

  const setPermission = (state: PermissionState): void => {
    permission = state;

    for (const status of permissions) {
      status.state = state;

      status.dispatchEvent(new Event('change'));
    }
  };

  const openMedia = (constraints: MediaStreamConstraints): Promise<MicrophoneStream> => {
    requests.push(constraints);

    if (permission === 'prompt') {
      if (options.answer === 'missing') {
        return Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
      }

      if (options.answer === 'dismiss') {
        return Promise.reject(new DOMException('Permission dismissed', 'NotAllowedError'));
      }

      const answered: PermissionState = options.answer === 'allow' ? 'granted' : 'denied';

      setPermission(answered);
    }

    if (permission === 'denied') {
      return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    }

    const track: StubTrack = {
      kind: 'audio',
      readyState: 'live',
      stop: () => {
        track.readyState = 'ended';
      },
    };

    tracks.push(track);

    return Promise.resolve({ getTracks: () => [track] });
  };

  const queryPermission = (): Promise<MicrophonePermission | null> => {
    if (options.permission === 'unsupported') {
      return Promise.resolve(null);
    }

    const status: StubPermission = Object.assign(new EventTarget(), { state: permission });

    permissions.push(status);

    return Promise.resolve(status);
  };

  return {
    microphone: {
      hasMediaDevices: () => options.hasMediaDevices ?? true,
      queryPermission,
      openMedia,
    },
    readRequests: () => requests,
    readTracks: () => tracks,
    setPermission,
  };
}
