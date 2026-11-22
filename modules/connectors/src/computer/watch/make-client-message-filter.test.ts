import { expect, test } from 'bun:test';
import { makeClientMessageFilter } from './make-client-message-filter';

function setupTest() {
  const filter = makeClientMessageFilter();

  const version = new TextEncoder().encode('RFB 003.008\n');

  return {
    filter,
    version,
    shakeHands: () => {
      filter.push(new Uint8Array([...version, 1, 1]));
    },
  };
}

test('it passes the client handshake on as it arrives', () => {
  const ctx = setupTest();

  const results = [
    ctx.filter.push(ctx.version),
    ctx.filter.push(new Uint8Array([1])),
    ctx.filter.push(new Uint8Array([1])),
  ];

  expect(results).toStrictEqual([
    { forward: [ctx.version], isMalformed: false },
    { forward: [new Uint8Array([1])], isMalformed: false },
    { forward: [new Uint8Array([1])], isMalformed: false },
  ]);
});

test.each([
  {
    name: 'an older protocol version',
    bytes: new TextEncoder().encode('RFB 003.003\n'),
  },
  {
    name: 'text that is no version',
    bytes: new TextEncoder().encode('GET / HTTP/1.1'),
  },
])('it closes on $name', (row) => {
  const ctx = setupTest();

  expect(ctx.filter.push(row.bytes)).toStrictEqual({
    forward: [],
    isMalformed: true,
  });
});

test('it closes when the client picks a security type other than none', () => {
  const ctx = setupTest();

  ctx.filter.push(ctx.version);

  expect(ctx.filter.push(new Uint8Array([2]))).toStrictEqual({
    forward: [],
    isMalformed: true,
  });
});

test.each([
  {
    name: 'SetPixelFormat',
    message: [0, 0, 0, 0, 32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
  { name: 'SetEncodings', message: [2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 5] },
  {
    name: 'FramebufferUpdateRequest',
    message: [3, 1, 0, 0, 0, 0, 5, 0, 3, 32],
  },
])('it passes a $name message on whole', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  expect(ctx.filter.push(new Uint8Array(row.message))).toStrictEqual({
    forward: [new Uint8Array(row.message)],
    isMalformed: false,
  });
});

test.each([
  { name: 'KeyEvent', message: [4, 1, 0, 0, 0, 0, 0, 97] },
  { name: 'PointerEvent', message: [5, 1, 0, 10, 0, 20] },
  { name: 'ClientCutText', message: [6, 0, 0, 0, 0, 0, 0, 3, 97, 98, 99] },
  { name: 'empty ClientCutText', message: [6, 0, 0, 0, 0, 0, 0, 0] },
  {
    name: 'extended clipboard reply, whose length is negative',
    message: [6, 0, 0, 0, 255, 255, 255, 248, 0, 0, 0, 6, 0, 0, 0, 1],
  },
])('it drops a $name message', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  expect(ctx.filter.push(new Uint8Array(row.message))).toStrictEqual({
    forward: [],
    isMalformed: false,
  });
});

test('it passes a viewing message that follows dropped input', () => {
  const ctx = setupTest();

  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  ctx.shakeHands();

  const result = ctx.filter.push(
    new Uint8Array([4, 1, 0, 0, 0, 0, 0, 97, 6, 0, 0, 0, 0, 0, 0, 2, 120, 121, ...request]),
  );

  expect(result).toStrictEqual({ forward: [request], isMalformed: false });
});

test('it passes a viewing message that follows an extended clipboard reply', () => {
  const ctx = setupTest();

  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  ctx.shakeHands();

  const result = ctx.filter.push(
    new Uint8Array([6, 0, 0, 0, 255, 255, 255, 248, 0, 0, 0, 6, 0, 0, 0, 1, ...request]),
  );

  expect(result).toStrictEqual({ forward: [request], isMalformed: false });
});

test('it reads a message that arrives in pieces', () => {
  const ctx = setupTest();

  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  ctx.shakeHands();

  const results = [ctx.filter.push(request.subarray(0, 3)), ctx.filter.push(request.subarray(3))];

  expect(results).toStrictEqual([
    { forward: [], isMalformed: false },
    { forward: [request], isMalformed: false },
  ]);
});

test('it drops the text of a clipboard message that arrives in pieces', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  const results = [
    ctx.filter.push(new Uint8Array([6, 0, 0, 0, 0, 0, 0, 4, 1, 2])),
    ctx.filter.push(new Uint8Array([3, 4])),
  ];

  expect(results).toStrictEqual([
    { forward: [], isMalformed: false },
    { forward: [], isMalformed: false },
  ]);
});

test.each([
  { name: 'an unknown type', message: [200, 0, 0, 0] },
  {
    name: 'an extended message such as EnableContinuousUpdates',
    message: [150, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'a SetEncodings that lists thousands of encodings',
    message: [2, 0, 255, 255],
  },
  {
    name: 'a ClientCutText far past any clipboard',
    message: [6, 0, 0, 0, 127, 255, 255, 255],
  },
  {
    name: 'an extended ClientCutText far past any clipboard',
    message: [6, 0, 0, 0, 128, 0, 0, 0],
  },
  {
    name: 'a SetPixelFormat of zero bits per pixel',
    message: [0, 0, 0, 0, 0, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
  {
    name: 'a SetPixelFormat of a depth past its bits',
    message: [0, 0, 0, 0, 32, 33, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
  {
    name: 'a SetPixelFormat of a true-colour flag of 2',
    message: [0, 0, 0, 0, 32, 24, 0, 2, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
  {
    name: 'a SetPixelFormat with a channel of no range',
    message: [0, 0, 0, 0, 32, 24, 0, 1, 0, 0, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
  {
    name: 'a SetPixelFormat with a channel maximum that is not 2^n-1',
    message: [0, 0, 0, 0, 32, 24, 0, 1, 0, 254, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
  {
    name: 'a SetPixelFormat with a channel past the pixel',
    message: [0, 0, 0, 0, 32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 30, 8, 0, 0, 0, 0],
  },
])('it closes on $name', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  expect(ctx.filter.push(new Uint8Array(row.message))).toStrictEqual({
    forward: [],
    isMalformed: true,
  });
});

test('it passes nothing after a malformed message, even a viewing one', () => {
  const ctx = setupTest();

  ctx.shakeHands();
  ctx.filter.push(new Uint8Array([200]));

  expect(ctx.filter.push(new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]))).toStrictEqual({
    forward: [],
    isMalformed: true,
  });
});
