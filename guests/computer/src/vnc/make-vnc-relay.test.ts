import { expect, test } from 'bun:test';
import type { VNCFrame } from '@heynixie/wire';
import { vncChunkLimitBytes } from '@heynixie/wire';
import { makeVNCRelay } from './make-vnc-relay';
import type { VNCLinkEvents } from './types';

function setupTest(options: { readonly maxStreams?: number; readonly isRefused?: boolean } = {}) {
  const sent: VNCFrame[] = [];
  const written: Uint8Array[] = [];
  const ended: number[] = [];
  const flushes: number[] = [];
  const connections: VNCLinkEvents[] = [];

  const relay = makeVNCRelay({
    maxStreams: options.maxStreams ?? 4,
    connect: (events) => {
      connections.push(events);

      return options.isRefused === true
        ? Promise.reject(new Error('refused'))
        : Promise.resolve({
            write: (bytes) => {
              written.push(bytes);
            },
            flush: () => {
              flushes.push(written.length);
            },
            end: () => {
              ended.push(ended.length);
            },
          });
    },
  });

  return {
    sent,
    written,
    ended,
    flushes,
    connections,
    deliver: (frame: VNCFrame) => {
      relay(frame, (outgoing) => {
        sent.push(outgoing);

        return Promise.resolve();
      });
    },
  };
}

test('it pipes server bytes to the VNC connection after a stream opens', async () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  await Promise.resolve();

  ctx.deliver({ kind: 'vnc-data', stream: 's1', data: new Uint8Array([1, 2]) });

  expect(ctx.written).toStrictEqual([new Uint8Array([1, 2])]);
});

test('it holds bytes that arrive before the connection is ready, in order', async () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });
  ctx.deliver({ kind: 'vnc-data', stream: 's1', data: new Uint8Array([1]) });
  ctx.deliver({ kind: 'vnc-data', stream: 's1', data: new Uint8Array([2]) });

  await Promise.resolve();

  expect(ctx.written).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
});

test('it sends VNC bytes back in frames no longer than the chunk limit', () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });
  ctx.connections[0]?.onData(new Uint8Array(vncChunkLimitBytes + 5));

  expect(
    ctx.sent.map((frame) => (frame.kind === 'vnc-data' ? frame.data.byteLength : -1)),
  ).toStrictEqual([vncChunkLimitBytes, 5]);
});

test('it closes the stream when the VNC connection closes', () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });
  ctx.connections[0]?.onClose();
  expect(ctx.sent).toStrictEqual([{ kind: 'vnc-close', stream: 's1' }]);
});

test('it closes the stream when the VNC server refuses the connection', async () => {
  const ctx = setupTest({ isRefused: true });

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  await Promise.resolve();
  await Promise.resolve();

  expect(ctx.sent).toStrictEqual([{ kind: 'vnc-close', stream: 's1' }]);
});

test('it ends the connection when the server closes the stream, and sends no close back', async () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  await Promise.resolve();

  ctx.deliver({ kind: 'vnc-close', stream: 's1' });
  ctx.connections[0]?.onClose();
  expect(ctx.ended).toHaveLength(1);
  expect(ctx.sent).toStrictEqual([]);
});

test('it drops bytes for a stream the server never opened', () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-data', stream: 'unknown', data: new Uint8Array([1]) });

  expect(ctx.written).toStrictEqual([]);
});

test('it never opens a stream of its own, and closes both on a second open of one id', async () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  await Promise.resolve();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  expect([ctx.connections.length, ctx.ended, ctx.sent]).toStrictEqual([
    1,
    [0],
    [{ kind: 'vnc-close', stream: 's1' }],
  ]);
});

test('it frees the slot of a stream that a second open of its id closed', async () => {
  const ctx = setupTest({ maxStreams: 1 });

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  await Promise.resolve();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });
  ctx.deliver({ kind: 'vnc-open', stream: 's2' });

  expect([ctx.connections.length, ctx.sent]).toStrictEqual([
    2,
    [{ kind: 'vnc-close', stream: 's1' }],
  ]);
});

test('it refuses a stream past the limit of open streams', () => {
  const ctx = setupTest({ maxStreams: 1 });

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });
  ctx.deliver({ kind: 'vnc-open', stream: 's2' });

  expect(ctx.sent).toStrictEqual([{ kind: 'vnc-close', stream: 's2' }]);
});

test('it drops the bytes held for a stream whose connection is not ready, on a flush', async () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });
  ctx.deliver({ kind: 'vnc-data', stream: 's1', data: new Uint8Array([1]) });
  ctx.deliver({ kind: 'vnc-flush', stream: 's1' });

  await Promise.resolve();

  ctx.deliver({ kind: 'vnc-data', stream: 's1', data: new Uint8Array([2]) });

  expect(ctx.written).toStrictEqual([new Uint8Array([2])]);
});

test('it flushes the connection of the stream a flush frame names, and no other', async () => {
  const ctx = setupTest();

  ctx.deliver({ kind: 'vnc-open', stream: 's1' });

  await Promise.resolve();

  ctx.deliver({ kind: 'vnc-flush', stream: 's1' });
  ctx.deliver({ kind: 'vnc-flush', stream: 'unknown' });

  expect(ctx.flushes).toHaveLength(1);
});
