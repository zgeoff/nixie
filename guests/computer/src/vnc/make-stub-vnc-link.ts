import type { VNCLink, VNCLinkEvents } from './types';

const greeting = new TextEncoder().encode('RFB 003.008\n');

interface PixelFormat {
  readonly isBigEndian: boolean;
  readonly redShift: number;
  readonly greenShift: number;
  readonly blueShift: number;
}

const defaultFormat: PixelFormat = {
  isBigEndian: false,
  redShift: 16,
  greenShift: 8,
  blueShift: 0,
};

type Phase = 'version' | 'security' | 'init' | 'messages';

interface StubState {
  phase: Phase;
  buffer: Uint8Array;
  format: PixelFormat;
  isFrameSent: boolean;
}

// A VNC server in the process, for the test build, which has no display. It speaks the protocol's
// 3.8 handshake with no security, then answers each framebuffer update request with one raw frame of
// a fixed gradient, in the pixel format the client asked for.
export function makeStubVNCLink(events: VNCLinkEvents): VNCLink {
  const state: StubState = {
    phase: 'version',
    buffer: new Uint8Array(),
    format: defaultFormat,
    isFrameSent: false,
  };

  queueMicrotask(() => {
    events.onData(greeting);
  });

  return {
    write: (bytes) => {
      state.buffer = join(state.buffer, bytes);

      while (consumeNext(state, events)) {
        // each pass takes one message from the buffer
      }
    },
    flush: () => {},
    end: () => {
      state.buffer = new Uint8Array();
    },
  };
}

function join(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.byteLength + second.byteLength);

  joined.set(first);
  joined.set(second, first.byteLength);

  return joined;
}

// takes one whole message off the buffer and answers it, and says whether it took one
function consumeNext(state: StubState, events: VNCLinkEvents): boolean {
  const size = readNextSize(state);

  if (size === null || state.buffer.byteLength < size) {
    return false;
  }

  const message = state.buffer.subarray(0, size);

  state.buffer = state.buffer.subarray(size);

  answer(state, message, events);

  return true;
}

function readNextSize(state: StubState): number | null {
  if (state.phase === 'version') {
    return 12;
  }

  if (state.phase !== 'messages') {
    return 1;
  }

  const [type] = state.buffer;

  if (type === 0) {
    return 20;
  }

  if (type === 2) {
    return state.buffer.byteLength < 4 ? null : 4 + 4 * readU16(state.buffer, 2);
  }

  if (type === 3) {
    return 10;
  }

  if (type === 4) {
    return 8;
  }

  if (type === 5) {
    return 6;
  }

  if (type === 6) {
    return state.buffer.byteLength < 8 ? null : 8 + readU32(state.buffer, 4);
  }

  return 1;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function answer(state: StubState, message: Uint8Array, events: VNCLinkEvents): void {
  if (state.phase === 'version') {
    state.phase = 'security';

    events.onData(new Uint8Array([1, 1]));

    return;
  }

  if (state.phase === 'security') {
    state.phase = 'init';

    events.onData(new Uint8Array(4));

    return;
  }

  if (state.phase === 'init') {
    state.phase = 'messages';

    events.onData(buildServerInit());

    return;
  }

  if (message[0] === 0) {
    state.format = readFormat(message);
  }

  if (message[0] === 3) {
    const isIncremental = message[1] !== 0;

    if (!isIncremental || !state.isFrameSent) {
      state.isFrameSent = true;

      events.onData(buildFrame(state.format));
    }
  }
}

export const stubFrameWidth = 320;
export const stubFrameHeight = 200;

function buildServerInit(): Uint8Array {
  const desktopName = new TextEncoder().encode('nixie test desktop');
  const init = new Uint8Array(24 + desktopName.byteLength);
  const view = new DataView(init.buffer);

  view.setUint16(0, stubFrameWidth);
  view.setUint16(2, stubFrameHeight);

  // 32 bits per pixel, depth 24, little endian, true colour, 8 bits per channel
  init.set([32, 24, 0, 1], 4);
  view.setUint16(8, 255);
  view.setUint16(10, 255);
  view.setUint16(12, 255);
  init.set([defaultFormat.redShift, defaultFormat.greenShift, defaultFormat.blueShift], 14);
  view.setUint32(20, desktopName.byteLength);
  init.set(desktopName, 24);

  return init;
}

// A client that asks for anything but 32 bits per pixel of true colour gets the default format, so
// the frame stays a valid raw rectangle.
function readFormat(message: Uint8Array): PixelFormat {
  const isTrueColour = message[7] !== 0;

  if (message[4] !== 32 || !isTrueColour) {
    return defaultFormat;
  }

  return {
    isBigEndian: message[6] !== 0,
    redShift: message[14] ?? defaultFormat.redShift,
    greenShift: message[15] ?? defaultFormat.greenShift,
    blueShift: message[16] ?? defaultFormat.blueShift,
  };
}

// a FramebufferUpdate of one raw rectangle that covers the whole screen
function buildFrame(format: PixelFormat): Uint8Array {
  const frame = new Uint8Array(16 + stubFrameWidth * stubFrameHeight * 4);
  const view = new DataView(frame.buffer);

  view.setUint16(2, 1);
  view.setUint16(8, stubFrameWidth);
  view.setUint16(10, stubFrameHeight);

  for (let row = 0; row < stubFrameHeight; row += 1) {
    for (let column = 0; column < stubFrameWidth; column += 1) {
      const red = Math.floor((column * 255) / (stubFrameWidth - 1));
      const green = Math.floor((row * 255) / (stubFrameHeight - 1));

      const pixel =
        (red << format.redShift) | (green << format.greenShift) | (128 << format.blueShift);

      view.setUint32(16 + (row * stubFrameWidth + column) * 4, pixel >>> 0, !format.isBigEndian);
    }
  }

  return frame;
}
