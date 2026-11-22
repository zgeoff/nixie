type Phase = 'version' | 'security' | 'init' | 'messages';

interface ClientFilterResult {
  // the bytes to pass on to the VNC server, in order
  readonly forward: readonly Uint8Array[];

  // true once the viewer sent a message the filter cannot read or does not allow
  readonly isMalformed: boolean;
}

export interface ClientMessageFilter {
  readonly push: (bytes: Uint8Array) => ClientFilterResult;
}

interface FilterState {
  phase: Phase;
  buffer: Uint8Array;

  // the bytes of a dropped clipboard message that the viewer has still to send
  skipBytes: number;
  isMalformed: boolean;
}

// Reads the viewer's bytes as RFB messages, whatever size the chunks arrive in. The handshake is the
// 3.8 version with no security, which the VNC server offers alone. A message of a type outside the
// handshake, the three passed types and the three dropped ones ends the stream as malformed.
export function makeClientMessageFilter(): ClientMessageFilter {
  const state: FilterState = {
    phase: 'version',
    buffer: new Uint8Array(),
    skipBytes: 0,
    isMalformed: false,
  };

  return {
    push: (bytes) => {
      if (state.isMalformed) {
        return { forward: [], isMalformed: true };
      }

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

      return { forward: state.isMalformed ? [] : forward, isMalformed: state.isMalformed };
    },
  };
}

function join(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.byteLength + second.byteLength);

  joined.set(first);
  joined.set(second, first.byteLength);

  return joined;
}

// The messages a viewer sends to the VNC server, as RFC 6143 lays them out. A watch passes the
// handshake and the three messages that ask to see the screen, and drops the three that act on the
// desktop, because nobody holds the desktop while a watch runs.
const passedTypes: ReadonlySet<number> = new Set([0, 2, 3]);

const keyEventBytes = 8;
const pointerEventBytes = 6;

// The bytes of the next message to pass on, an empty array for a message dropped, or null when the
// buffer holds no whole message yet.
function takeNext(state: FilterState): Uint8Array | null {
  if (state.isMalformed) {
    return null;
  }

  if (state.skipBytes > 0) {
    return skipDropped(state);
  }

  if (state.phase !== 'messages') {
    return takeHandshake(state);
  }

  const [type] = state.buffer;

  if (type === undefined) {
    return null;
  }

  if (type === 4) {
    return takeBytes(state, keyEventBytes, false);
  }

  if (type === 5) {
    return takeBytes(state, pointerEventBytes, false);
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

// Takes a whole message of the size from the buffer, and returns it when it is to pass on.
function takeBytes(state: FilterState, size: number, isPassed: boolean): Uint8Array | null {
  if (state.buffer.byteLength < size) {
    return null;
  }

  const message = state.buffer.slice(0, size);

  state.buffer = state.buffer.subarray(size);

  return isPassed ? message : new Uint8Array();
}

function reject(state: FilterState): null {
  state.isMalformed = true;

  state.buffer = new Uint8Array();

  return null;
}

const cutTextHeaderBytes = 8;
const maxCutTextBytes = 1024 * 1024;

function takeCutText(state: FilterState): Uint8Array | null {
  if (state.buffer.byteLength < cutTextHeaderBytes) {
    return null;
  }

  const length = new DataView(
    state.buffer.buffer,
    state.buffer.byteOffset,
    state.buffer.byteLength,
  ).getUint32(4);

  if (length > maxCutTextBytes) {
    return reject(state);
  }

  state.buffer = state.buffer.subarray(cutTextHeaderBytes);
  state.skipBytes = length;

  return new Uint8Array();
}

const setPixelFormatBytes = 20;
const framebufferRequestBytes = 10;
const setEncodingsHeaderBytes = 4;

// A viewer lists about 20 encodings, so a count far past that is no viewer.
const maxEncodings = 256;

function takePassed(state: FilterState, type: number): Uint8Array | null {
  if (type === 0) {
    return takeBytes(state, setPixelFormatBytes, true);
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
