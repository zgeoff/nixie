type Phase = 'version' | 'security' | 'init' | 'messages';

interface ClientFilterResult {
  // the bytes to pass on to the VNC server, in order
  readonly forward: readonly Uint8Array[];

  // true once the viewer sent a message the filter cannot read or does not allow
  readonly isMalformed: boolean;

  // true when a key or pointer message is among the bytes to pass on
  readonly isInput: boolean;
}

export interface ClientMessageFilter {
  readonly push: (bytes: Uint8Array) => ClientFilterResult;

  // true for a message that push returned among its key and pointer messages
  readonly isInputMessage: (message: Uint8Array) => boolean;

  // The messages that release every key and button the filter passed as pressed, which it then
  // forgets. The keys come first, and the pointer last at the point where it was.
  readonly collectReleases: () => Uint8Array[];
}

export interface ClientFilterOptions {
  // whether the viewer holds the desktop now: only then does a key or pointer message pass
  readonly canInput: () => boolean;
}

interface FilterState {
  phase: Phase;
  buffer: Uint8Array;

  // the bytes of a dropped clipboard message that the viewer has still to send
  skipBytes: number;

  // the bytes of a passed clipboard message that the viewer has still to send
  passBytes: number;
  isMalformed: boolean;
  readonly canInput: () => boolean;

  // the keys passed down and not yet up, and the pointer as it was last passed on
  readonly pressedKeys: Set<number>;
  pointer: { readonly buttons: number; readonly x: number; readonly y: number } | null;

  // how many key and pointer messages have passed, and which they were
  inputCount: number;
  readonly inputMessages: WeakSet<Uint8Array>;
}

// Reads the viewer's bytes as RFB messages, whatever size the chunks arrive in. A key, pointer or
// clipboard message passes only while the viewer holds the desktop, never the extended clipboard.
// The handshake is the 3.8 version with no security, which the VNC server offers alone.
export function makeClientMessageFilter(options: ClientFilterOptions): ClientMessageFilter {
  const state: FilterState = {
    phase: 'version',
    buffer: new Uint8Array(),
    skipBytes: 0,
    passBytes: 0,
    isMalformed: false,
    canInput: options.canInput,
    pressedKeys: new Set(),
    pointer: null,
    inputCount: 0,
    inputMessages: new WeakSet(),
  };

  return {
    push: (bytes) => {
      if (state.isMalformed) {
        return { forward: [], isMalformed: true, isInput: false };
      }

      const inputBefore = state.inputCount;

      state.buffer = join(state.buffer, bytes);

      const forward: Uint8Array[] = [];

      for (;;) {
        const taken = takeNext(state);

        if (taken === null) {
          break;
        }

        if (taken.length > 0) {
          forward.push(taken);
        }
      }

      return {
        forward: state.isMalformed ? [] : forward,
        isMalformed: state.isMalformed,
        isInput: !state.isMalformed && state.inputCount !== inputBefore,
      };
    },
    isInputMessage: (message) => state.inputMessages.has(message),
    collectReleases: () => collectReleases(state),
  };
}

function join(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.byteLength + second.byteLength);

  joined.set(first);
  joined.set(second, first.byteLength);

  return joined;
}

// The messages a viewer sends to the VNC server, as RFC 6143 lays them out. A watch passes the
// handshake and the three messages that ask to see the screen. It passes a key, a pointer and a
// clipboard message only while the viewer holds the desktop.
const passedTypes: ReadonlySet<number> = new Set([0, 2, 3]);

// The bytes of the next message to pass on, an empty array for a message dropped, or null when the
// buffer holds no whole message yet.
function takeNext(state: FilterState): Uint8Array | null {
  if (state.isMalformed) {
    return null;
  }

  if (state.skipBytes > 0) {
    return skipDropped(state);
  }

  if (state.passBytes > 0) {
    return passText(state);
  }

  if (state.phase !== 'messages') {
    return takeHandshake(state);
  }

  const [type] = state.buffer;

  if (type === undefined) {
    return null;
  }

  if (type === 4 || type === 5) {
    return takeInput(state, type);
  }

  if (type === 6) {
    return takeCutText(state);
  }

  if (!passedTypes.has(type)) {
    return reject(state);
  }

  return takePassed(state, type);
}

function skipDropped(state: FilterState): Uint8Array | null {
  if (state.buffer.byteLength === 0) {
    return null;
  }

  const skipped = Math.min(state.skipBytes, state.buffer.byteLength);

  state.skipBytes -= skipped;
  state.buffer = state.buffer.subarray(skipped);

  return new Uint8Array();
}

// The text of a passed clipboard message goes on as it arrives, so the VNC server stays in step with
// the viewer even when a hold ends part way through.
function passText(state: FilterState): Uint8Array | null {
  if (state.buffer.byteLength === 0) {
    return null;
  }

  const size = Math.min(state.passBytes, state.buffer.byteLength);

  state.passBytes -= size;

  return takeBytes(state, size, true);
}

// Takes a whole message of the size from the buffer, and returns it when it is to pass on.
function takeBytes(state: FilterState, size: number, isPassed: boolean): Uint8Array | null {
  if (state.buffer.byteLength < size) {
    return null;
  }

  const message = state.buffer.slice(0, size);

  state.buffer = state.buffer.subarray(size);

  return isPassed ? message : new Uint8Array();
}

const protocolVersion = new TextEncoder().encode('RFB 003.008\n');

const securityNone = 1;

function takeHandshake(state: FilterState): Uint8Array | null {
  if (state.phase === 'version') {
    if (state.buffer.byteLength < protocolVersion.byteLength) {
      return null;
    }

    const isVersion = protocolVersion.every((byte, index) => state.buffer[index] === byte);

    state.phase = 'security';

    return isVersion ? takeBytes(state, protocolVersion.byteLength, true) : reject(state);
  }

  const [choice] = state.buffer;

  if (choice === undefined) {
    return null;
  }

  if (state.phase === 'security') {
    state.phase = 'init';

    return choice === securityNone ? takeBytes(state, 1, true) : reject(state);
  }

  state.phase = 'messages';

  return takeBytes(state, 1, true);
}

function reject(state: FilterState): null {
  state.isMalformed = true;

  state.buffer = new Uint8Array();

  return null;
}

const keyEventBytes = 8;
const pointerEventBytes = 6;

// A key or pointer message passes, and is remembered as pressed or not, only for a viewer that
// holds the desktop. Any other viewer's is read whole and dropped.
function takeInput(state: FilterState, type: 4 | 5): Uint8Array | null {
  const size = type === 4 ? keyEventBytes : pointerEventBytes;
  const isAllowed = state.canInput();
  const message = takeBytes(state, size, isAllowed);

  if (message === null || message.byteLength === 0) {
    return message;
  }

  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);

  state.inputCount += 1;

  state.inputMessages.add(message);

  if (type === 4) {
    const key = view.getUint32(4);

    if (message[1] === 0) {
      state.pressedKeys.delete(key);
    } else {
      state.pressedKeys.add(key);
    }
  } else {
    state.pointer = { buttons: view.getUint8(1), x: view.getUint16(2), y: view.getUint16(4) };
  }

  return message;
}

const cutTextHeaderBytes = 8;
const maxCutTextBytes = 1024 * 1024;

function takeCutText(state: FilterState): Uint8Array | null {
  if (state.buffer.byteLength < cutTextHeaderBytes) {
    return null;
  }

  // A negative length is the extended clipboard format, which a viewer such as noVNC answers with
  // even when it is view only. The size of its data is the length without the sign.
  const signedLength = new DataView(
    state.buffer.buffer,
    state.buffer.byteOffset,
    state.buffer.byteLength,
  ).getInt32(4);

  const length = Math.abs(signedLength);

  if (length > maxCutTextBytes) {
    return reject(state);
  }

  if (signedLength < 0 || !state.canInput()) {
    state.buffer = state.buffer.subarray(cutTextHeaderBytes);
    state.skipBytes = length;

    return new Uint8Array();
  }

  state.inputCount += 1;
  state.passBytes = length;

  return takeBytes(state, cutTextHeaderBytes, true);
}

const framebufferRequestBytes = 10;
const setEncodingsHeaderBytes = 4;

// A viewer lists about 20 encodings, so a count far past that is no viewer.
const maxEncodings = 256;

function takePassed(state: FilterState, type: number): Uint8Array | null {
  if (type === 0) {
    return takePixelFormat(state);
  }

  if (type === 3) {
    return takeBytes(state, framebufferRequestBytes, true);
  }

  if (state.buffer.byteLength < setEncodingsHeaderBytes) {
    return null;
  }

  const count = new DataView(
    state.buffer.buffer,
    state.buffer.byteOffset,
    state.buffer.byteLength,
  ).getUint16(2);

  return count > maxEncodings
    ? reject(state)
    : takeBytes(state, setEncodingsHeaderBytes + 4 * count, true);
}

const setPixelFormatBytes = 20;
const pixelFormatOffset = 4;

// SetPixelFormat is the type, 3 bytes of padding, then the 16-byte format that RFC 6143 lays out.
function takePixelFormat(state: FilterState): Uint8Array | null {
  if (state.buffer.byteLength < setPixelFormatBytes) {
    return null;
  }

  return isPixelFormat(state.buffer.subarray(pixelFormatOffset, setPixelFormatBytes))
    ? takeBytes(state, setPixelFormatBytes, true)
    : reject(state);
}

// A format the VNC server could not draw with: a depth that does not fit its bits per pixel, a flag
// that is no boolean, or a colour channel whose maximum is not 2^n-1 or does not fit in the pixel.
function isPixelFormat(format: Uint8Array): boolean {
  const view = new DataView(format.buffer, format.byteOffset, format.byteLength);

  const bitsPerPixel = view.getUint8(0);
  const depth = view.getUint8(1);
  const isBigEndian = view.getUint8(2);
  const isTrueColour = view.getUint8(3);

  if (![8, 16, 32].includes(bitsPerPixel) || depth < 1 || depth > bitsPerPixel) {
    return false;
  }

  if (isBigEndian > 1 || isTrueColour > 1) {
    return false;
  }

  return (
    isTrueColour === 0 ||
    [
      { max: view.getUint16(4), shift: view.getUint8(10) },
      { max: view.getUint16(6), shift: view.getUint8(11) },
      { max: view.getUint16(8), shift: view.getUint8(12) },
    ].every(
      (channel) =>
        channel.max > 0 &&
        (channel.max & (channel.max + 1)) === 0 &&
        channel.shift + channel.max.toString(2).length <= bitsPerPixel,
    )
  );
}

function collectReleases(state: FilterState): Uint8Array[] {
  const releases = [...state.pressedKeys].map((key) => buildKeyEvent(key, false));

  if (state.pointer !== null && state.pointer.buttons !== 0) {
    releases.push(buildPointerEvent(0, state.pointer.x, state.pointer.y));
  }

  state.pressedKeys.clear();

  state.pointer = null;

  return releases;
}

function buildKeyEvent(key: number, isDown: boolean): Uint8Array {
  const message = new Uint8Array(keyEventBytes);

  message[0] = 4;
  message[1] = isDown ? 1 : 0;

  new DataView(message.buffer).setUint32(4, key);

  return message;
}

function buildPointerEvent(buttons: number, x: number, y: number): Uint8Array {
  const message = new Uint8Array(pointerEventBytes);
  const view = new DataView(message.buffer);

  message[0] = 5;
  message[1] = buttons;

  view.setUint16(2, x);
  view.setUint16(4, y);

  return message;
}
