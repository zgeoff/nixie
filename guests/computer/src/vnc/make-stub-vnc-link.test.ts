import { expect, test } from 'bun:test';
import { makeStubVNCLink, stubFrameHeight, stubFrameWidth } from './make-stub-vnc-link';

function setupTest() {
  const received: Uint8Array[] = [];

  const link = makeStubVNCLink({
    onData: (bytes) => {
      received.push(bytes);
    },
    onClose: () => {},
  });

  return {
    received,
    link,
    sendRequest: (isIncremental: boolean) => {
      const request = new Uint8Array(10);

      request[0] = 3;
      request[1] = isIncremental ? 1 : 0;

      link.write(request);
    },
    handshake: async () => {
      await Promise.resolve();

      link.write(new TextEncoder().encode('RFB 003.008\n'));
      link.write(new Uint8Array([1]));
      link.write(new Uint8Array([1]));
    },
  };
}

test('it greets with the 3.8 protocol version', async () => {
  const ctx = setupTest();

  await Promise.resolve();

  expect(new TextDecoder().decode(ctx.received[0])).toBe('RFB 003.008\n');
});

test('it answers the handshake with security none and the size of its frame', async () => {
  const ctx = setupTest();

  await ctx.handshake();

  const init = ctx.received.at(3);

  const view = new DataView(init?.buffer ?? new ArrayBuffer(0), init?.byteOffset, init?.byteLength);

  expect(ctx.received[1]).toStrictEqual(new Uint8Array([1, 1]));
  expect(ctx.received[2]).toStrictEqual(new Uint8Array(4));
  expect([view.getUint16(0), view.getUint16(2)]).toStrictEqual([stubFrameWidth, stubFrameHeight]);
});

test('it answers a framebuffer update request with one raw rectangle of the whole frame', async () => {
  const ctx = setupTest();

  await ctx.handshake();

  ctx.sendRequest(false);

  const frame = ctx.received.at(4);

  expect(frame?.byteLength).toBe(16 + stubFrameWidth * stubFrameHeight * 4);
  expect([frame?.[0], frame?.[3]]).toStrictEqual([0, 1]);
});

test('it sends no second frame for an incremental request, because nothing changed', async () => {
  const ctx = setupTest();

  await ctx.handshake();

  ctx.sendRequest(false);
  ctx.sendRequest(true);

  expect(ctx.received).toHaveLength(5);
});

test('it reads a request that arrives in two pieces', async () => {
  const ctx = setupTest();

  await ctx.handshake();

  const request = new Uint8Array(10);

  request[0] = 3;

  ctx.link.write(request.subarray(0, 4));
  ctx.link.write(request.subarray(4));

  expect(ctx.received).toHaveLength(5);
});
