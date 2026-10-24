import { onTestFinished } from 'bun:test';

type StubMicrophoneAnswer = 'allow' | 'block' | 'dismiss' | 'missing';

export interface StubMicrophoneOptions {
  readonly permission: PermissionState | 'unsupported';
  readonly answer: StubMicrophoneAnswer;
}

interface StubTrack {
  readonly kind: 'audio';
  readyState: MediaStreamTrackState;
  readonly stop: () => void;
}

export interface StubMicrophone {
  readonly readRequests: () => readonly MediaStreamConstraints[];
  readonly readTracks: () => readonly StubTrack[];
  readonly setPermission: (state: PermissionState) => void;
}

interface StubPermissionStatus extends EventTarget {
  readonly name: 'microphone';
  state: PermissionState;
}

// happy-dom has no navigator.mediaDevices, and its navigator.permissions grants everything, so this
// stands in for both with the answers Chrome gives: a refusal is a NotAllowedError, and only a
// block changes the permission. An unsupported permission refuses its query, as older Firefox does.
export function registerStubMicrophone(options: StubMicrophoneOptions): StubMicrophone {
  const requests: MediaStreamConstraints[] = [];
  const tracks: StubTrack[] = [];
  const statuses: StubPermissionStatus[] = [];

  let permission: PermissionState =
    options.permission === 'unsupported' ? 'prompt' : options.permission;

  const setPermission = (state: PermissionState): void => {
    permission = state;

    for (const status of statuses) {
      status.state = state;

      status.dispatchEvent(new Event('change'));
    }
  };

  const answerMediaRequest = (constraints: MediaStreamConstraints): Promise<unknown> => {
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

  const answerPermissionQuery = (
    descriptor: PermissionDescriptor,
  ): Promise<StubPermissionStatus> => {
    if (descriptor.name !== 'microphone' || options.permission === 'unsupported') {
      return Promise.reject(
        new TypeError(`'${descriptor.name}' is not a valid value for enumeration PermissionName.`),
      );
    }

    const status: StubPermissionStatus = Object.assign(new EventTarget(), {
      name: 'microphone' as const,
      state: permission,
    });

    statuses.push(status);

    return Promise.resolve(status);
  };

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: answerMediaRequest },
  });

  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, 'mediaDevices');
  });

  Object.defineProperty(globalThis.navigator, 'permissions', {
    configurable: true,
    value: { query: answerPermissionQuery },
  });

  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, 'permissions');
  });

  return {
    readRequests: () => requests,
    readTracks: () => tracks,
    setPermission,
  };
}
