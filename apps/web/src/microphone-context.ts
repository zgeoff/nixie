import { createContext } from 'react';

export interface MicrophonePermission extends EventTarget {
  readonly state: PermissionState;
}

interface MicrophoneTrack {
  readonly stop: () => void;
}

export interface MicrophoneStream {
  readonly getTracks: () => readonly MicrophoneTrack[];
}

export interface Microphone {
  readonly hasMediaDevices: () => boolean;
  readonly queryPermission: () => Promise<MicrophonePermission | null>;
  readonly openMedia: (constraints: MediaStreamConstraints) => Promise<MicrophoneStream>;
}

const browserMicrophone: Microphone = {
  hasMediaDevices: () => 'mediaDevices' in globalThis.navigator,
  queryPermission: queryBrowserPermission,
  openMedia: openBrowserMedia,
};

export const MicrophoneContext = createContext<Microphone>(browserMicrophone);

async function queryBrowserPermission(): Promise<MicrophonePermission | null> {
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

function openBrowserMedia(constraints: MediaStreamConstraints): Promise<MicrophoneStream> {
  return globalThis.navigator.mediaDevices.getUserMedia(constraints);
}
