import { onTestFinished } from 'bun:test';

type Phase = 'version' | 'security' | 'init' | 'messages';

interface DesktopSocketData {
  phase: Phase;
  buffer: Uint8Array;
  isFrameSent: boolean;
}

export interface StubDesktop {
  // the WebSocket URL that a viewer connects to
  readonly url: string;
}

// A VNC server in the test process, for a browser suite: it speaks the 3.8 handshake with no
// security, then answers the first whole-screen request with one raw frame of a flat colour, which
// is enough for the viewer to show the desktop. It takes no input.
export function startStubDesktop(): StubDesktop {
  const server = Bun.serve<DesktopSocketData>({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerUpgrade,
    websocket: {
      open: (socket) => {
        socket.sendBinary(new TextEncoder().encode('RFB 003.008\n'));
      },
      message: (socket, message) => {
        if (typeof message === 'string') {
          return;
        }

        socket.data.buffer = join(socket.data.buffer, new Uint8Array(message));

        while (answerNext(socket)) {
          // each pass takes one message from the buffer
        }
      },
    },
  });

  onTestFinished(async () => {
    await server.stop(true);
  });

  return { url: `ws://127.0.0.1:${String(server.port)}/` };
}

function answerUpgrade(
  request: Request,
  server: Bun.Server<DesktopSocketData>,
): Response | undefined {
  const data: DesktopSocketData = {
    phase: 'version',
    buffer: new Uint8Array(),
    isFrameSent: false,
  };

  return server.upgrade(request, { data }) ? undefined : new Response(null, { status: 400 });
}

function join(first: Uint8Array, second: Uint8Array): Uint8Array {
  const joined = new Uint8Array(first.byteLength + second.byteLength);

  joined.set(first);
  joined.set(second, first.byteLength);

  return joined;
}

// takes one whole message off the buffer and answers it, and says whether it took one
function answerNext(socket: Bun.ServerWebSocket<DesktopSocketData>): boolean {
  const data = socket.data;
  const size = readNextSize(data);

  if (size === null || data.buffer.byteLength < size) {
    return false;
  }

  const message = data.buffer.subarray(0, size);

  data.buffer = data.buffer.subarray(size);

  if (data.phase === 'version') {
    data.phase = 'security';

    socket.sendBinary(new Uint8Array([1, 1]));
  } else if (data.phase === 'security') {
    data.phase = 'init';

    socket.sendBinary(new Uint8Array(4));
  } else if (data.phase === 'init') {
    data.phase = 'messages';

    socket.sendBinary(buildServerInit());
  } else if (message[0] === 3 && !data.isFrameSent) {
    data.isFrameSent = true;

    socket.sendBinary(buildFrame());
  }

  return true;
}

function readNextSize(data: DesktopSocketData): number | null {
  if (data.phase === 'version') {
    return 12;
  }

  if (data.phase !== 'messages') {
    return 1;
  }

  const [type] = data.buffer;

  if (type === 0) {
    return 20;
  }

  if (type === 2) {
    return data.buffer.byteLength < 4
      ? null
      : 4 + 4 * new DataView(data.buffer.buffer, data.buffer.byteOffset).getUint16(2);
  }

  if (type === 3) {
    return 10;
  }

  return 1;
}

const frameWidth = 64;
const frameHeight = 48;

function buildServerInit(): Uint8Array {
  const name = new TextEncoder().encode('stub desktop');
  const init = new Uint8Array(24 + name.byteLength);
  const view = new DataView(init.buffer);

  view.setUint16(0, frameWidth);
  view.setUint16(2, frameHeight);

  // 32 bits per pixel, depth 24, little endian, true colour, 8 bits per channel
  init.set([32, 24, 0, 1], 4);
  view.setUint16(8, 255);
  view.setUint16(10, 255);
  view.setUint16(12, 255);
  init.set([16, 8, 0], 14);
  view.setUint32(20, name.byteLength);
  init.set(name, 24);

  return init;
}

// a FramebufferUpdate of one raw rectangle that covers the screen, in an opaque blue
function buildFrame(): Uint8Array {
  const frame = new Uint8Array(16 + frameWidth * frameHeight * 4);
  const view = new DataView(frame.buffer);

  view.setUint16(2, 1);
  view.setUint16(8, frameWidth);
  view.setUint16(10, frameHeight);

  for (let index = 0; index < frameWidth * frameHeight; index += 1) {
    view.setUint32(16 + index * 4, 0x00_00_00_ff, true);
  }

  return frame;
}
