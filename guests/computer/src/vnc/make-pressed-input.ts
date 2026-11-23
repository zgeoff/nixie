import { isInputMessage } from './is-input-message';

export interface PressedInput {
  // notes what a message written to the VNC server did to the keys and buttons
  readonly track: (message: Uint8Array) => void;

  // The messages that release each key and button still pressed, as they stand once `ahead`, a
  // message not yet noted, is written: the keys first, and the pointer last where it was.
  readonly listReleases: (ahead?: Uint8Array) => Uint8Array[];
}

interface PressedState {
  readonly keys: Set<number>;
  pointer: { readonly buttons: number; readonly x: number; readonly y: number } | null;
}

export function makePressedInput(): PressedInput {
  const state: PressedState = { keys: new Set(), pointer: null };

  return {
    track: (message) => {
      applyMessage(state, message);
    },
    listReleases: (ahead) => {
      const copy: PressedState = { keys: new Set(state.keys), pointer: state.pointer };

      if (ahead !== undefined) {
        applyMessage(copy, ahead);
      }

      return buildReleases(copy);
    },
  };
}

function applyMessage(state: PressedState, message: Uint8Array): void {
  if (!isInputMessage(message)) {
    return;
  }

  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);

  if (message[0] === 5) {
    state.pointer = { buttons: view.getUint8(1), x: view.getUint16(2), y: view.getUint16(4) };

    return;
  }

  const key = view.getUint32(4);

  if (message[1] === 0) {
    state.keys.delete(key);
  } else {
    state.keys.add(key);
  }
}

function buildReleases(state: PressedState): Uint8Array[] {
  const releases = [...state.keys].map((key) => {
    const message = new Uint8Array(8);

    message[0] = 4;

    new DataView(message.buffer).setUint32(4, key);

    return message;
  });

  if (state.pointer !== null && state.pointer.buttons !== 0) {
    const message = new Uint8Array(6);
    const view = new DataView(message.buffer);

    message[0] = 5;

    view.setUint16(2, state.pointer.x);
    view.setUint16(4, state.pointer.y);
    releases.push(message);
  }

  return releases;
}
