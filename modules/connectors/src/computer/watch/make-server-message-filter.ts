import { match } from 'ts-pattern';
import {
  copyRectEncoding,
  cursorEncoding,
  desktopSizeEncoding,
  rawEncoding,
  zrleEncoding,
} from './constants';

type Phase = 'version' | 'security' | 'result' | 'init' | 'messages';

interface ServerFilterResult {
  // the bytes to pass on to the viewer, in order
  readonly forward: readonly Uint8Array[];

  // true once the VNC server sent bytes that the filter cannot frame
  readonly isMalformed: boolean;
}

export interface ServerMessageFilter {
  readonly push: (bytes: Uint8Array) => ServerFilterResult;

  // the bits per pixel that the VNC server announced, or null before its ServerInit
  readonly readPixelBits: () => number | null;
}

export interface ServerFilterOptions {
  // whether the viewer holds the desktop now: only then does the desktop's clipboard text pass
  readonly canInput: () => boolean;
}

interface HeldText {
  readonly header: Uint8Array;
  readonly parts: Uint8Array[];
  left: number;
}

interface FilterState {
  phase: Phase;
  buffer: Uint8Array;

  // the bytes of the message or rectangle in hand that pass on as they arrive
  passBytes: number;

  // the bytes of a dropped clipboard message that the VNC server has still to send
  skipBytes: number;

  // a clipboard message of a viewer that holds the desktop, kept until it is whole
  heldText: HeldText | null;

  // the rectangles of the update in hand that are still to come
  rectsLeft: number;
  pixelBits: number | null;
  isMalformed: boolean;
  readonly canInput: () => boolean;
}

// Reads the VNC server's bytes as RFB messages, whatever size the chunks arrive in. The clipboard
// text of the desktop passes only while the viewer holds the desktop, and bytes that no message
// frames end the stream, because they could be clipboard text that it misread.
export function makeServerMessageFilter(options: ServerFilterOptions): ServerMessageFilter {
  const state: FilterState = {
    phase: 'version',
    buffer: new Uint8Array(),
    passBytes: 0,
    skipBytes: 0,
    heldText: null,
    rectsLeft: 0,
    pixelBits: null,
    isMalformed: false,
    canInput: options.canInput,
  };

  return {
    push: (bytes) => {
      if (state.isMalformed) {
        return { forward: [], isMalformed: true };
      }

      state.buffer = join(state.buffer, bytes);

      const forward: Uint8Array[] = [];

      while (takeNext(state, forward) === 'took') {
        // each pass takes one step from the buffer
      }

      return { forward: state.isMalformed ? [] : forward, isMalformed: state.isMalformed };
    },
    readPixelBits: () => state.pixelBits,
  };
}

function join(first: Uint8Array, second: Uint8Array): Uint8Array {
  if (first.byteLength === 0) {
    return second;
  }

  const joined = new Uint8Array(first.byteLength + second.byteLength);

  joined.set(first);
  joined.set(second, first.byteLength);

  return joined;
}

// What a step did: it took bytes from the buffer, or the buffer holds too few for it yet.
type Step = 'took' | 'waits';

function takeNext(state: FilterState, forward: Uint8Array[]): Step {
  if (state.isMalformed || state.buffer.byteLength === 0) {
    return 'waits';
  }

  if (state.skipBytes > 0) {
    return skipText(state);
  }

  if (state.heldText !== null) {
    return holdText(state, state.heldText, forward);
  }

  if (state.passBytes > 0) {
    return passSpan(state, forward);
  }

  if (state.rectsLeft > 0) {
    return takeRectangle(state, forward);
  }

  return state.phase === 'messages' ? takeMessage(state, forward) : takeHandshake(state, forward);
}

function skipText(state: FilterState): Step {
  const skipped = Math.min(state.skipBytes, state.buffer.byteLength);

  state.skipBytes -= skipped;
  state.buffer = state.buffer.subarray(skipped);

  return 'took';
}

function holdText(state: FilterState, held: HeldText, forward: Uint8Array[]): Step {
  const size = Math.min(held.left, state.buffer.byteLength);

  held.parts.push(state.buffer.slice(0, size));

  held.left -= size;
  state.buffer = state.buffer.subarray(size);

  if (held.left === 0) {
    state.heldText = null;

    if (state.canInput()) {
      forward.push(held.header, ...held.parts);
    }
  }

  return 'took';
}

function passSpan(state: FilterState, forward: Uint8Array[]): Step {
  const size = Math.min(state.passBytes, state.buffer.byteLength);

  forward.push(state.buffer.slice(0, size));

  state.passBytes -= size;
  state.buffer = state.buffer.subarray(size);

  return 'took';
}

const rectangleHeaderBytes = 12;
const zrleLengthBytes = 4;

// The header of a rectangle, and from it how many bytes of data follow. The data passes as it arrives.
function takeRectangle(state: FilterState, forward: Uint8Array[]): Step {
  if (state.buffer.byteLength < rectangleHeaderBytes) {
    return 'waits';
  }

  const view = new DataView(state.buffer.buffer, state.buffer.byteOffset, state.buffer.byteLength);

  const width = view.getUint16(4);
  const height = view.getUint16(6);
  const encoding = view.getInt32(8);
  const bytesPerPixel = (state.pixelBits ?? 0) / 8;

  if (encoding === zrleEncoding) {
    if (state.buffer.byteLength < rectangleHeaderBytes + zrleLengthBytes) {
      return 'waits';
    }

    state.passBytes = view.getUint32(rectangleHeaderBytes);
    state.rectsLeft -= 1;

    return passPiece(state, rectangleHeaderBytes + zrleLengthBytes, forward);
  }

  const dataBytes = match(encoding)
    .with(rawEncoding, () => width * height * bytesPerPixel)
    .with(copyRectEncoding, () => 4)
    .with(desktopSizeEncoding, () => 0)
    .with(cursorEncoding, () => width * height * bytesPerPixel + ((width + 7) >> 3) * height)
    .otherwise(() => null);

  if (dataBytes === null || bytesPerPixel === 0) {
    return reject(state);
  }

  state.passBytes = dataBytes;
  state.rectsLeft -= 1;

  return passPiece(state, rectangleHeaderBytes, forward);
}

// Takes the next n bytes as one piece to pass on, or waits when the buffer holds fewer.
function passPiece(state: FilterState, size: number, forward: Uint8Array[]): Step {
  if (state.buffer.byteLength < size) {
    return 'waits';
  }

  forward.push(state.buffer.slice(0, size));

  state.buffer = state.buffer.subarray(size);

  return 'took';
}

function reject(state: FilterState): Step {
  state.isMalformed = true;

  state.buffer = new Uint8Array();

  return 'waits';
}

function takeMessage(state: FilterState, forward: Uint8Array[]): Step {
  const [type] = state.buffer;

  if (type === 0) {
    return takeUpdateHeader(state, forward);
  }

  if (type === 1) {
    return takeColourMap(state, forward);
  }

  if (type === 2) {
    return passPiece(state, 1, forward);
  }

  if (type === 3) {
    return takeCutText(state);
  }

  return reject(state);
}

const updateHeaderBytes = 4;

function takeUpdateHeader(state: FilterState, forward: Uint8Array[]): Step {
  if (state.buffer.byteLength < updateHeaderBytes) {
    return 'waits';
  }

  state.rectsLeft = new DataView(
    state.buffer.buffer,
    state.buffer.byteOffset,
    state.buffer.byteLength,
  ).getUint16(2);

  return passPiece(state, updateHeaderBytes, forward);
}

const colourMapHeaderBytes = 6;
const colourMapEntryBytes = 6;

function takeColourMap(state: FilterState, forward: Uint8Array[]): Step {
  if (state.buffer.byteLength < colourMapHeaderBytes) {
    return 'waits';
  }

  const count = new DataView(
    state.buffer.buffer,
    state.buffer.byteOffset,
    state.buffer.byteLength,
  ).getUint16(4);

  state.passBytes = count * colourMapEntryBytes;

  return passPiece(state, colourMapHeaderBytes, forward);
}

const cutTextHeaderBytes = 8;

// Skips a clipboard message whose text is beyond what a viewer takes, a megabyte.
const maxCutTextBytes = 1024 * 1024;

// A message of the clipboard text that the desktop copied. It never passes to a viewer that only
// watches, and passes to the holder when it is whole and the viewer still holds the desktop, so a
// hold that ends part way through the text sends none of it.
function takeCutText(state: FilterState): Step {
  if (state.buffer.byteLength < cutTextHeaderBytes) {
    return 'waits';
  }

  const header = state.buffer.slice(0, cutTextHeaderBytes);
  const length = Math.abs(new DataView(header.buffer).getInt32(4));

  state.buffer = state.buffer.subarray(cutTextHeaderBytes);

  if (length > maxCutTextBytes || !state.canInput()) {
    state.skipBytes = length;
  } else {
    state.heldText = { header, parts: [], left: length };
  }

  return 'took';
}

const protocolVersion = new TextEncoder().encode('RFB 003.008\n');

const securityNone = 1;
const securityResultBytes = 4;

function takeHandshake(state: FilterState, forward: Uint8Array[]): Step {
  if (state.phase === 'version') {
    if (state.buffer.byteLength < protocolVersion.byteLength) {
      return 'waits';
    }

    if (!protocolVersion.every((byte, index) => state.buffer[index] === byte)) {
      return reject(state);
    }

    state.phase = 'security';

    return passPiece(state, protocolVersion.byteLength, forward);
  }

  if (state.phase === 'security') {
    const [count, type] = state.buffer;

    if (state.buffer.byteLength < 2) {
      return 'waits';
    }

    if (count !== 1 || type !== securityNone) {
      return reject(state);
    }

    state.phase = 'result';

    return passPiece(state, 2, forward);
  }

  if (state.phase === 'result') {
    if (state.buffer.byteLength < securityResultBytes) {
      return 'waits';
    }

    if (state.buffer.subarray(0, securityResultBytes).some((byte) => byte !== 0)) {
      return reject(state);
    }

    state.phase = 'init';

    return passPiece(state, securityResultBytes, forward);
  }

  return takeServerInit(state, forward);
}

const serverInitHeaderBytes = 24;

// A name that no VNC server of nixie's computer comes near.
const maxNameBytes = 4096;

function takeServerInit(state: FilterState, forward: Uint8Array[]): Step {
  if (state.buffer.byteLength < serverInitHeaderBytes) {
    return 'waits';
  }

  const view = new DataView(state.buffer.buffer, state.buffer.byteOffset, state.buffer.byteLength);

  const nameBytes = view.getUint32(20);
  const bitsPerPixel = view.getUint8(4);

  if (nameBytes > maxNameBytes || ![8, 16, 32].includes(bitsPerPixel)) {
    return reject(state);
  }

  state.phase = 'messages';
  state.pixelBits = bitsPerPixel;
  state.passBytes = nameBytes;

  return passPiece(state, serverInitHeaderBytes, forward);
}
