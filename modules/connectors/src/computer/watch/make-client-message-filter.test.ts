import { expect, test } from 'bun:test';
import { makeClientMessageFilter } from './make-client-message-filter';

function setupTest() {
  const holder = { isHolding: false };

  const filter = makeClientMessageFilter({
    canInput: () => holder.isHolding,
    readPixelBits: () => 32,
  });

  const version = new TextEncoder().encode('RFB 003.008\n');

  return {
    filter,
    holder,
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
    { forward: [ctx.version], isMalformed: false, isInput: false },
    { forward: [new Uint8Array([1])], isMalformed: false, isInput: false },
    { forward: [new Uint8Array([1])], isMalformed: false, isInput: false },
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
    isInput: false,
  });
});

test('it closes when the client picks a security type other than none', () => {
  const ctx = setupTest();

  ctx.filter.push(ctx.version);

  expect(ctx.filter.push(new Uint8Array([2]))).toStrictEqual({
    forward: [],
    isMalformed: true,
    isInput: false,
  });
});

test.each([
  {
    name: 'SetPixelFormat',
    message: [0, 0, 0, 0, 32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0],
  },
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
    isInput: false,
  });
});

test.each([
  {
    name: 'only the encodings whose size the server filter can read',
    asked: [7, 0, 5, 16, -239, 21, 1],
    passed: [0, 1, 16, -239],
  },
  { name: 'Raw added to a list without it', asked: [5, 16], passed: [0, 16] },
  { name: 'Raw alone for a list of none it can read', asked: [7, 5], passed: [0] },
])('it passes a SetEncodings message with $name', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  const message = new Uint8Array(4 + 4 * row.asked.length);
  const view = new DataView(message.buffer);

  message[0] = 2;

  view.setUint16(2, row.asked.length);

  for (const [index, encoding] of row.asked.entries()) {
    view.setInt32(4 + 4 * index, encoding);
  }

  const expected = new Uint8Array(4 + 4 * row.passed.length);
  const expectedView = new DataView(expected.buffer);

  expected[0] = 2;

  expectedView.setUint16(2, row.passed.length);

  for (const [index, encoding] of row.passed.entries()) {
    expectedView.setInt32(4 + 4 * index, encoding);
  }

  expect(ctx.filter.push(message)).toStrictEqual({
    forward: [expected],
    isMalformed: false,
    isInput: false,
  });
});

test.each([
  { name: 'KeyEvent', message: [4, 1, 0, 0, 0, 0, 0, 97] },
  { name: 'PointerEvent', message: [5, 1, 0, 10, 0, 20] },
])('it drops a $name message from a viewer that does not hold the desktop', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  expect(ctx.filter.push(new Uint8Array(row.message))).toStrictEqual({
    forward: [],
    isMalformed: false,
    isInput: false,
  });
});

test.each([
  { name: 'KeyEvent', message: [4, 1, 0, 0, 0, 0, 0, 97] },
  { name: 'PointerEvent', message: [5, 1, 0, 10, 0, 20] },
])('it passes a $name message on whole for the viewer that holds the desktop', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  expect(ctx.filter.push(new Uint8Array(row.message))).toStrictEqual({
    forward: [new Uint8Array(row.message)],
    isMalformed: false,
    isInput: true,
  });
});

test('it drops a pointer message sent after the viewer stopped holding the desktop', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  ctx.filter.push(new Uint8Array([5, 0, 0, 1, 0, 1]));

  ctx.holder.isHolding = false;

  expect(ctx.filter.push(new Uint8Array([5, 1, 0, 10, 0, 20]))).toStrictEqual({
    forward: [],
    isMalformed: false,
    isInput: false,
  });
});

test('it releases the keys and the button still pressed, the pointer at its last place', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  ctx.filter.push(
    new Uint8Array([
      4, 1, 0, 0, 0, 0, 0, 97, 4, 1, 0, 0, 0, 0, 0, 98, 4, 0, 0, 0, 0, 0, 0, 97, 5, 1, 0, 10, 0, 20,
    ]),
  );

  expect(ctx.filter.collectReleases()).toStrictEqual([
    new Uint8Array([4, 0, 0, 0, 0, 0, 0, 98]),
    new Uint8Array([5, 0, 0, 10, 0, 20]),
  ]);
});

test('it releases nothing when every key and button is up, and nothing the second time', () => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  ctx.filter.push(new Uint8Array([4, 1, 0, 0, 0, 0, 0, 97, 5, 1, 0, 1, 0, 1]));

  const first = ctx.filter.collectReleases().length;

  expect([first, ctx.filter.collectReleases()]).toStrictEqual([2, []]);
});

test.each([
  { name: 'ClientCutText', message: [6, 0, 0, 0, 0, 0, 0, 3, 97, 98, 99] },
  { name: 'empty ClientCutText', message: [6, 0, 0, 0, 0, 0, 0, 0] },
  {
    name: 'extended clipboard reply, whose length is negative',
    message: [6, 0, 0, 0, 255, 255, 255, 248, 0, 0, 0, 6, 0, 0, 0, 1],
  },
])('it drops a $name message even from the viewer that holds the desktop', (row) => {
  const ctx = setupTest();

  ctx.shakeHands();

  ctx.holder.isHolding = true;

  expect(ctx.filter.push(new Uint8Array(row.message))).toStrictEqual({
    forward: [],
    isMalformed: false,
    isInput: false,
  });
});

test('it passes a viewing message that follows dropped input', () => {
  const ctx = setupTest();

  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  ctx.shakeHands();

  const result = ctx.filter.push(
    new Uint8Array([4, 1, 0, 0, 0, 0, 0, 97, 6, 0, 0, 0, 0, 0, 0, 2, 120, 121, ...request]),
  );

  expect(result).toStrictEqual({ forward: [request], isMalformed: false, isInput: false });
});

test('it passes a viewing message that follows an extended clipboard reply', () => {
  const ctx = setupTest();

  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  ctx.shakeHands();

  const result = ctx.filter.push(
    new Uint8Array([6, 0, 0, 0, 255, 255, 255, 248, 0, 0, 0, 6, 0, 0, 0, 1, ...request]),
  );

  expect(result).toStrictEqual({ forward: [request], isMalformed: false, isInput: false });
});

test('it reads a message that arrives in pieces', () => {
  const ctx = setupTest();

  const request = new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]);

  ctx.shakeHands();

  const results = [ctx.filter.push(request.subarray(0, 3)), ctx.filter.push(request.subarray(3))];

  expect(results).toStrictEqual([
    { forward: [], isMalformed: false, isInput: false },
    { forward: [request], isMalformed: false, isInput: false },
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
    { forward: [], isMalformed: false, isInput: false },
    { forward: [], isMalformed: false, isInput: false },
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
    name: 'a SetPixelFormat with another pixel size than the server announced',
    message: [0, 0, 0, 0, 16, 16, 0, 1, 0, 31, 0, 63, 0, 31, 11, 5, 0, 0, 0, 0],
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
    isInput: false,
  });
});

test('it passes nothing after a malformed message, even a viewing one', () => {
  const ctx = setupTest();

  ctx.shakeHands();
  ctx.filter.push(new Uint8Array([200]));

  expect(ctx.filter.push(new Uint8Array([3, 1, 0, 0, 0, 0, 5, 0, 3, 32]))).toStrictEqual({
    forward: [],
    isMalformed: true,
    isInput: false,
  });
});
